/**
 * Playwright Extension Testing Fixture
 *
 * Provides a custom fixture for testing Chrome extensions with Playwright.
 * Extensions require headed mode and special configuration for loading.
 *
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/extension';
 *
 * test('should load extension', async ({ page, extensionId }) => {
 *   await page.goto('https://example.com');
 *   // Test extension functionality
 * });
 * ```
 */

import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

/**
 * Get the path to the extension's build directory
 */
function getExtensionPath(): string {
  // Adjust this path based on where your extension builds to
  return path.join(__dirname, '../../dist');
}

/**
 * Extended Playwright test with extension support
 *
 * This fixture:
 * - Launches Chromium in headed mode (required for extensions)
 * - Loads the extension from the dist directory
 * - Provides the extension ID for testing
 * - Configures proper permissions and settings
 */
export const test = base.extend<ExtensionFixtures>({
  // Override context to load extension
  context: async ({}, use) => {
    const extensionPath = getExtensionPath();

    const defaultViewport = { width: 1280, height: 720 };
    const scale = 0.3;
    const scaledViewport = {
      width: Math.max(360, Math.floor(defaultViewport.width * scale)),
      height: Math.max(200, Math.floor(defaultViewport.height * scale)),
    };

    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      viewport: scaledViewport,
    });

    // Wait for extension to initialize before running tests
    const initPage = await context.newPage();
    await initPage.goto('https://example.com');
    await initPage.waitForTimeout(2000);
    await initPage.close();

    await use(context);
    await context.close();
  },

  // Provide extension ID for testing
  extensionId: async ({ context }, use) => {
    // Extract extension ID from service worker URL
    // This is more reliable than chrome://extensions which doesn't render in Playwright
    let extensionId: string | null = null;

    // Wait for service worker to be available
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      const workers = context.serviceWorkers();
      if (workers.length > 0) {
        const workerUrl = workers[0].url();
        // Extract ID from URL like: chrome-extension://mkdbacmghakikjkemcahonodffmphffp/...
        const match = workerUrl.match(/chrome-extension:\/\/([a-z]+)\//);
        if (match) {
          extensionId = match[1];
          break;
        }
      }

      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!extensionId) {
      throw new Error(
        'Extension service worker not found. ' +
        'Ensure "npm run build" completed successfully and dist/ directory exists.'
      );
    }

    await use(extensionId);
  },
});

export { expect } from '@playwright/test';

/**
 * Helper: Extract extension ID from service worker URL
 * More reliable than chrome://extensions which doesn't render properly in Playwright
 */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  // Wait for service worker to be available
  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    const workers = context.serviceWorkers();
    if (workers.length > 0) {
      const workerUrl = workers[0].url();
      // Extract ID from URL like: chrome-extension://mkdbacmghakikjkemcahonodffmphffp/...
      const match = workerUrl.match(/chrome-extension:\/\/([a-z]+)\//);
      if (match) {
        return match[1];
      }
    }

    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(
    'Extension service worker not found after 10 seconds. ' +
    'Ensure "npm run build" completed successfully and dist/ directory exists.'
  );
}

/**
 * Helper: Navigate to extension popup
 */
export async function openExtensionPopup(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const page = await context.newPage();
  await page.goto(popupUrl);
}

/**
 * Helper: Navigate to extension options page
 */
export async function openExtensionOptions(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;
  const page = await context.newPage();
  await page.goto(optionsUrl);
}

/**
 * Helper: Navigate to canvas page
 */
export async function openCanvasPage(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  const canvasUrl = `chrome-extension://${extensionId}/src/canvas/index.html`;
  const page = await context.newPage();
  await page.goto(canvasUrl);
}

/**
 * Helper: Wait for extension content script to load
 */
export async function waitForContentScript(
  page: any,
  timeout = 5000
): Promise<void> {
  await page.waitForFunction(
    () => {
      // Check if content script has injected a specific element or variable
      return (window as any).__NABOKOV_EXTENSION_LOADED__ === true;
    },
    { timeout }
  );
}

/**
 * Helper: Simulate extension message passing
 */
export async function sendExtensionMessage(
  context: BrowserContext,
  extensionId: string,
  message: any
): Promise<any> {
  const page = await context.newPage();
  return await page.evaluate(
    async ({ id, msg }) => {
      return new Promise((resolve) => {
        (chrome as any).runtime.sendMessage(id, msg, (response: any) => {
          resolve(response);
        });
      });
    },
    { id: extensionId, msg: message }
  );
}

/**
 * Helper: Get extension storage data
 */
export async function getExtensionStorage(
  context: BrowserContext,
  extensionIdOrKeys?: string | string[] | null,
  maybeKeys?: string | string[] | null
): Promise<any> {
  let extensionId: string;
  let keys: string | string[] | null | undefined;

  if (maybeKeys !== undefined) {
    extensionId = extensionIdOrKeys as string;
    keys = maybeKeys ?? null;
  } else if (Array.isArray(extensionIdOrKeys) || extensionIdOrKeys === null) {
    extensionId = await getExtensionId(context);
    keys = extensionIdOrKeys ?? null;
  } else if (typeof extensionIdOrKeys === 'string') {
    // Ambiguous string: assume caller omitted extensionId and provided a key
    extensionId = await getExtensionId(context);
    keys = extensionIdOrKeys;
  } else {
    extensionId = await getExtensionId(context);
    keys = null;
  }

  const page = await context.newPage();

  // Navigate to extension page to get chrome API access
  await page.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);

  const result = await page.evaluate(
    async (storageKeys) => {
      return new Promise((resolve) => {
        chrome.storage.local.get(storageKeys || null, (items) => {
          resolve(items);
        });
      });
    },
    keys
  );

  await page.close();
  return result;
}

/**
 * Helper: Set extension storage data
 */
export async function setExtensionStorage(
  context: BrowserContext,
  extensionIdOrItems: string | Record<string, any>,
  maybeItems?: Record<string, any>
): Promise<void> {
  let extensionId: string;
  let items: Record<string, any>;

  if (typeof extensionIdOrItems === 'string') {
    extensionId = extensionIdOrItems;
    if (!maybeItems) {
      throw new Error('setExtensionStorage: items payload is required when extensionId is provided explicitly.');
    }
    items = maybeItems;
  } else {
    items = extensionIdOrItems;
    extensionId = await getExtensionId(context);
  }

  const page = await context.newPage();

  // Navigate to extension page to get chrome API access
  await page.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);

  await page.evaluate(
    async (data) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set(data, () => {
          resolve();
        });
      });
    },
    items
  );

  await page.close();
}

/**
 * Helper: Clear extension storage
 */
export async function clearExtensionStorage(
  context: BrowserContext,
  extensionIdOrUndefined?: string
): Promise<void> {
  const resolvedExtensionId = extensionIdOrUndefined ?? await getExtensionId(context);
  const page = await context.newPage();

  // Navigate to extension page to get chrome API access
  await page.goto(`chrome-extension://${resolvedExtensionId}/src/canvas/index.html`);

  await page.evaluate(
    async () => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.clear(() => {
          resolve();
        });
      });
    }
  );

  await page.close();
}

/**
 * Helper: Create a test page with specific HTML content
 */
export async function createTestPage(
  context: BrowserContext,
  html: string
): Promise<any> {
  const page = await context.newPage();
  await page.setContent(html);
  return page;
}

/**
 * Helper: Wait for element to be selectable (visible and enabled)
 */
export async function waitForSelectableElement(
  page: any,
  selector: string,
  timeout = 5000
): Promise<void> {
  await page.waitForSelector(selector, {
    state: 'visible',
    timeout,
  });
  await page.waitForFunction(
    (sel: string) => {
      const el = document.querySelector(sel);
      return el && !(el as HTMLElement).hasAttribute('disabled');
    },
    selector,
    { timeout }
  );
}
