/**
 * E2E tests for Element Chat collapse states and processing indicators
 *
 * Tests:
 * - Multi-level collapse (expanded → rectangle → square → expanded)
 * - Processing visual indicators (color changes during streaming)
 * - Size restoration when expanding from collapsed states
 */

import { test, expect } from '../fixtures/extension';
import type { Page, BrowserContext, Worker } from '@playwright/test';

const TEST_URL = 'https://example.com';
const CHAT_HOST_SELECTOR = '[data-nabokov-element-chat]';
const CONTAINER_SELECTOR = '[data-collapse-state]';
const RECTANGLE_BUTTON_SELECTOR = '[data-test-id="collapse-rectangle-button"]';
const SQUARE_BUTTON_SELECTOR = '[data-test-id="collapse-square-button"]';
const SQUARE_TOGGLE_SELECTOR = '[data-test-id="square-expand-toggle"]';
const SEND_BUTTON_SELECTOR = 'button[data-test-id="send-button"]';

// -----------------------------------------------------------------------------
// Extension helpers
// -----------------------------------------------------------------------------

async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  return serviceWorker;
}

async function sendMessageToContentScript(
  context: BrowserContext,
  page: Page,
  message: any
): Promise<void> {
  const serviceWorker = await getServiceWorker(context);

  await serviceWorker.evaluate(async (msg: any) => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        try {
          await chrome.tabs.sendMessage(tab.id, msg);
          break;
        } catch (e) {
          // Ignore errors (tab might not have the content script yet)
        }
      }
    }
  }, message);
}

async function waitForShadowRoot(page: Page, containerId: string, timeout = 5000): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const hasShadow = await page.evaluate((id) => {
      const container = document.querySelector(`#${id}`);
      return container !== null && container.shadowRoot !== null;
    }, containerId);

    if (hasShadow) return true;
    await page.waitForTimeout(100);
  }

  return false;
}

async function openElementChat(page: Page, context: BrowserContext): Promise<void> {
  await sendMessageToContentScript(context, page, {
    type: 'ACTIVATE_CHAT_SELECTOR'
  });

  await page.waitForTimeout(1000);
  await waitForShadowRoot(page, 'nabokov-clipper-root');

  const h1 = await page.locator('h1').first();
  await h1.click();
  await page.waitForTimeout(1500);
}

// -----------------------------------------------------------------------------
// Shadow DOM helpers
// -----------------------------------------------------------------------------

const waitForShadowElement = async (page: Page, selector: string): Promise<void> => {
  await expect.poll(() => page.evaluate(({ hostSelector, sel }) => {
    const hosts = document.querySelectorAll(hostSelector);
    const host = hosts.length > 0 ? hosts[hosts.length - 1] : null;
    return Boolean(host?.shadowRoot?.querySelector(sel));
  }, { hostSelector: CHAT_HOST_SELECTOR, sel: selector })).toBe(true);
};

const getShadowAttribute = (page: Page, selector: string, attribute: string) => page.evaluate(({ hostSelector, sel, attr }) => {
  const hosts = document.querySelectorAll(hostSelector);
  const host = hosts.length > 0 ? hosts[hosts.length - 1] : null;
  const element = host?.shadowRoot?.querySelector(sel) as HTMLElement | null;
  return element?.getAttribute(attr) ?? null;
}, { hostSelector: CHAT_HOST_SELECTOR, sel: selector, attr: attribute });

const getShadowText = (page: Page, selector: string) => page.evaluate(({ hostSelector, sel }) => {
  const hosts = document.querySelectorAll(hostSelector);
  const host = hosts.length > 0 ? hosts[hosts.length - 1] : null;
  const element = host?.shadowRoot?.querySelector(sel) as HTMLElement | null;
  return element?.textContent?.trim() ?? null;
}, { hostSelector: CHAT_HOST_SELECTOR, sel: selector });

const clickShadowElement = async (page: Page, selector: string): Promise<void> => {
  await waitForShadowElement(page, selector);
  await page.evaluate(({ hostSelector, sel }) => {
    const hosts = document.querySelectorAll(hostSelector);
    const host = hosts.length > 0 ? hosts[hosts.length - 1] : null;
    const element = host?.shadowRoot?.querySelector(sel) as HTMLElement | null;
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, { hostSelector: CHAT_HOST_SELECTOR, sel: selector });
};

const setShadowTextareaValue = async (page: Page, value: string): Promise<void> => {
  await waitForShadowElement(page, 'textarea');
  await page.evaluate(({ hostSelector, val }) => {
    const hosts = document.querySelectorAll(hostSelector);
    const host = hosts.length > 0 ? hosts[hosts.length - 1] : null;
    const textarea = host?.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.value = val;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { hostSelector: CHAT_HOST_SELECTOR, val: value });
};

const getShadowBoundingBox = (page: Page, selector: string) => page.evaluate(({ hostSelector, sel }) => {
  const hosts = document.querySelectorAll(hostSelector);
  const host = hosts.length > 0 ? hosts[hosts.length - 1] : null;
  const element = host?.shadowRoot?.querySelector(sel) as HTMLElement | null;
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}, { hostSelector: CHAT_HOST_SELECTOR, sel: selector });

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

test.describe('Element Chat - Collapse States & Processing Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');
  });

  test('should cycle through all three collapse states', async ({ page, context }) => {
    await openElementChat(page, context);

    await waitForShadowElement(page, CONTAINER_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('expanded');

    await clickShadowElement(page, RECTANGLE_BUTTON_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('rectangle');
    const rectangleBox = await getShadowBoundingBox(page, CONTAINER_SELECTOR);
    expect(rectangleBox?.height ?? 0).toBeLessThan(50);

    await clickShadowElement(page, SQUARE_BUTTON_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('square');
    const squareBox = await getShadowBoundingBox(page, CONTAINER_SELECTOR);
    expect(squareBox?.width ?? 0).toBeCloseTo(64, 10);
    expect(squareBox?.height ?? 0).toBeCloseTo(64, 10);

    await clickShadowElement(page, SQUARE_TOGGLE_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('expanded');
  });

  test('should show correct icons for each collapse state', async ({ page, context }) => {
    await openElementChat(page, context);

    await waitForShadowElement(page, RECTANGLE_BUTTON_SELECTOR);
    await expect.poll(() => getShadowText(page, RECTANGLE_BUTTON_SELECTOR)).toBe('▭');
    await expect.poll(() => getShadowText(page, SQUARE_BUTTON_SELECTOR)).toBe('◼');

    await clickShadowElement(page, RECTANGLE_BUTTON_SELECTOR);
    await expect.poll(() => getShadowText(page, RECTANGLE_BUTTON_SELECTOR)).toBe('⤢');

    await clickShadowElement(page, SQUARE_BUTTON_SELECTOR);
    await expect.poll(() => getShadowText(page, SQUARE_TOGGLE_SELECTOR)).toBe('💬');

    await clickShadowElement(page, SQUARE_TOGGLE_SELECTOR);
    await expect.poll(() => getShadowText(page, RECTANGLE_BUTTON_SELECTOR)).toBe('▭');
    await expect.poll(() => getShadowText(page, SQUARE_BUTTON_SELECTOR)).toBe('◼');
  });

  test('should maintain correct button tooltips for each state', async ({ page, context }) => {
    await openElementChat(page, context);

    const tooltip = (selector: string) => getShadowAttribute(page, selector, 'title');

    await expect.poll(() => tooltip(RECTANGLE_BUTTON_SELECTOR)).toBe('Collapse to rectangle');
    await expect.poll(() => tooltip(SQUARE_BUTTON_SELECTOR)).toBe('Collapse to square');

    await clickShadowElement(page, RECTANGLE_BUTTON_SELECTOR);
    await expect.poll(() => tooltip(RECTANGLE_BUTTON_SELECTOR)).toBe('Expand to full window');
    await expect.poll(() => tooltip(SQUARE_BUTTON_SELECTOR)).toBe('Collapse to square');

    await clickShadowElement(page, SQUARE_BUTTON_SELECTOR);
    await expect.poll(() => tooltip(SQUARE_TOGGLE_SELECTOR)).toBe('Expand chat');

    await clickShadowElement(page, SQUARE_TOGGLE_SELECTOR);
    await expect.poll(() => tooltip(RECTANGLE_BUTTON_SELECTOR)).toBe('Collapse to rectangle');
    await expect.poll(() => tooltip(SQUARE_BUTTON_SELECTOR)).toBe('Collapse to square');
  });

  test('should show processing state when sending message', async ({ page, context }) => {
    await openElementChat(page, context);

    await waitForShadowElement(page, CONTAINER_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-processing')).toBe('false');

    await setShadowTextareaValue(page, 'Test message');
    await clickShadowElement(page, SEND_BUTTON_SELECTOR);

    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-processing')).toBe('true');
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-processing')).toBe('false');
  });

  test('should hide content when collapsed to rectangle or square', async ({ page, context }) => {
    await openElementChat(page, context);

    await waitForShadowElement(page, CONTAINER_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('expanded');

    const expandedBox = await getShadowBoundingBox(page, CONTAINER_SELECTOR);
    const expandedHeight = expandedBox?.height ?? 0;
    expect(expandedHeight).toBeGreaterThan(200);

    await clickShadowElement(page, RECTANGLE_BUTTON_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('rectangle');
    const rectangleBox = await getShadowBoundingBox(page, CONTAINER_SELECTOR);
    expect(rectangleBox?.height ?? 0).toBeLessThan(expandedHeight / 2);

    await clickShadowElement(page, SQUARE_BUTTON_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('square');
    const squareBox = await getShadowBoundingBox(page, CONTAINER_SELECTOR);
    expect(squareBox?.height ?? 0).toBeCloseTo(64, 10);
  });

  test('should restore expanded size when expanding from square', async ({ page, context }) => {
    await openElementChat(page, context);

    await waitForShadowElement(page, CONTAINER_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('expanded');

    const initialBox = await getShadowBoundingBox(page, CONTAINER_SELECTOR);
    const initialWidth = initialBox?.width ?? 0;
    const initialHeight = initialBox?.height ?? 0;

    await clickShadowElement(page, RECTANGLE_BUTTON_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('rectangle');

    await clickShadowElement(page, SQUARE_BUTTON_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('square');

    await clickShadowElement(page, SQUARE_TOGGLE_SELECTOR);
    await expect.poll(() => getShadowAttribute(page, CONTAINER_SELECTOR, 'data-collapse-state')).toBe('expanded');

    const restoredBox = await getShadowBoundingBox(page, CONTAINER_SELECTOR);
    expect(restoredBox?.width ?? 0).toBeCloseTo(initialWidth, 20);
    expect(restoredBox?.height ?? 0).toBeCloseTo(initialHeight, 20);
  });
});
