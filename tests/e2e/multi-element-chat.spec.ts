import { test, expect, setExtensionStorage } from '../fixtures/extension';
import type { BrowserContext, Page } from '@playwright/test';

const TEST_URL = 'https://example.com/multi-chat-test';
const MARKDOWN_URL = 'https://example.com/markdown-chat-test';

async function getServiceWorker(context: BrowserContext) {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  return serviceWorker;
}

async function sendMessageToContentScript(
  context: BrowserContext,
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
        } catch (error) {
          console.warn('[multi-element-chat spec] Failed to send message to tab', tab.id, error);
        }
      }
    }
  }, message);
}

async function waitForShadowRoot(page: Page, hostId: string, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hasShadowRoot = await page.evaluate((selector: string) => {
      const host = document.getElementById(selector);
      return Boolean(host && host.shadowRoot);
    }, hostId);

    if (hasShadowRoot) {
      return;
    }

    await page.waitForTimeout(100);
  }
  throw new Error(`Shadow root not found for ${hostId}`);
}

async function getShadowTextList(page: Page, hostId: string, selector: string) {
  return page.evaluate(({ hostId, selector }) => {
    const host = document.getElementById(hostId);
    if (!host?.shadowRoot) return [];
    return Array.from(host.shadowRoot.querySelectorAll(selector)).map((el) => el.textContent?.trim() || '');
  }, { hostId, selector });
}

async function getShadowElementCount(page: Page, hostId: string, selector: string) {
  return page.evaluate(({ hostId, selector }) => {
    const host = document.getElementById(hostId);
    if (!host?.shadowRoot) return 0;
    return host.shadowRoot.querySelectorAll(selector).length;
  }, { hostId, selector });
}

async function clickShadowElement(page: Page, hostId: string, selector: string, index = 0) {
  await page.evaluate(({ hostId, selector, index }) => {
    const host = document.getElementById(hostId);
    if (!host?.shadowRoot) throw new Error('Shadow root not found');
    const elements = host.shadowRoot.querySelectorAll(selector);
    const target = elements[index] as HTMLElement | undefined;
    if (!target) throw new Error(`Element not found for selector ${selector} at index ${index}`);
    target.click();
  }, { hostId, selector, index });
}

async function getChatPosition(page: Page, hostId: string) {
  return page.evaluate((selector: string) => {
    const host = document.getElementById(selector);
    if (!host) {
      throw new Error('Chat host not found');
    }
    const rect = host.getBoundingClientRect();
    return { top: rect.top, left: rect.left };
  }, hostId);
}

function computeStorageKey(pageUrl: string): string {
  let hash = 0;
  for (let i = 0; i < pageUrl.length; i++) {
    const char = pageUrl.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hashStr = Math.abs(hash).toString(36);
  return `nabokov_element_chats_${hashStr}`;
}

const multiSelectModifier = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Multi-element chat experience', () => {
  test('shows anchor chips for each selected element', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_URL);
    await page.evaluate(() => {
      document.body.innerHTML = `
        <style>
          section { padding: 40px; margin: 40px 0; border: 1px solid #ccc; }
        </style>
        <main>
          <section id="alpha" data-testid="alpha">First block</section>
          <section id="beta" data-testid="beta">Second block</section>
        </main>
      `;
    });

    await sendMessageToContentScript(context, { type: 'ACTIVATE_CHAT_SELECTOR' });
    await page.waitForTimeout(500);

    await page.click('#alpha');
    await page.click('#beta', { modifiers: [multiSelectModifier] });
    await page.keyboard.press('Enter');

    const chatContainer = await page.waitForSelector('[data-nabokov-element-chat]');
    const containerId = await chatContainer.getAttribute('id');
    expect(containerId).toBeTruthy();
    await waitForShadowRoot(page, containerId!);

    const chipCount = await getShadowElementCount(page, containerId!, '[data-test-id="element-anchor-list"] button');
    expect(chipCount).toBeGreaterThanOrEqual(2);

    const chipTexts = await getShadowTextList(page, containerId!, '[data-test-id="element-anchor-list"] button');
    expect(chipTexts.join(' ')).toContain('<section#alpha');
    expect(chipTexts.join(' ')).toContain('<section#beta');

    await page.close();
  });

  test('repositions with page scroll when switching anchors', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_URL);
    await page.evaluate(() => {
      document.body.innerHTML = `
        <style>
          body { height: 2000px; }
          .anchor { padding: 24px; margin: 200px 0; border: 1px dashed #888; }
        </style>
        <article>
          <div id="anchor-one" class="anchor" style="margin-top: 100px;">Anchor One</div>
          <div id="anchor-two" class="anchor" style="margin-top: 600px;">Anchor Two</div>
        </article>
      `;
    });

    await sendMessageToContentScript(context, { type: 'ACTIVATE_CHAT_SELECTOR' });
    await page.waitForTimeout(500);

    await page.click('#anchor-one');
    await page.click('#anchor-two', { modifiers: [multiSelectModifier] });
    await page.keyboard.press('Enter');

    const chatContainer = await page.waitForSelector('[data-nabokov-element-chat]');
    const containerId = await chatContainer.getAttribute('id');
    expect(containerId).toBeTruthy();
    await waitForShadowRoot(page, containerId!);

    await clickShadowElement(page, containerId!, '[data-test-id="element-anchor-list"] button', 1);

    const before = await getChatPosition(page, containerId!);
    const beforeTarget = await page.evaluate(() => {
      const rect = document.getElementById('anchor-two')!.getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    });

    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'instant' }));
    await page.waitForTimeout(300);

    const after = await getChatPosition(page, containerId!);
    const afterTarget = await page.evaluate(() => {
      const rect = document.getElementById('anchor-two')!.getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    });

    const deltaBefore = before.top - beforeTarget.top;
    const deltaAfter = after.top - afterTarget.top;
    expect(Math.abs(deltaBefore - deltaAfter)).toBeLessThan(20);

    await page.close();
  });

  test('renders persisted markdown content with external links', async ({ context, extensionId }) => {
    const chatId = 'multi-anchor-shared';
    const pageUrl = MARKDOWN_URL;
    const storageKey = computeStorageKey(pageUrl);
    const timestamp = Date.now();

    const primaryDescriptor = {
      chatId,
      tagName: 'div',
      id: 'markdown-anchor',
      classes: ['markdown-block'],
      cssSelector: '#markdown-anchor',
      xpath: '/html/body/div[1]',
      textPreview: 'Markdown Anchor',
      boundingRect: { top: 0, left: 0, width: 300, height: 80 },
    };

    const secondaryDescriptor = {
      chatId,
      tagName: 'div',
      id: 'markdown-secondary',
      classes: ['markdown-block'],
      cssSelector: '#markdown-secondary',
      xpath: '/html/body/div[2]',
      textPreview: 'Secondary Anchor',
      boundingRect: { top: 200, left: 0, width: 300, height: 80 },
    };

    const session = {
      chatId: `chat-${timestamp}`,
      elementId: chatId,
      pageUrl,
      elementDescriptor: primaryDescriptor,
      elementDescriptors: [primaryDescriptor, secondaryDescriptor],
      elementIds: [chatId, chatId],
      messages: [
        {
          id: 'msg-user',
          role: 'user' as const,
          content: '### Request\nPlease summarise **this** snippet.',
          timestamp,
        },
        {
          id: 'msg-assistant',
          role: 'assistant' as const,
          content: '**Summary**: Refer to [Docs](https://docs.example) for full details.',
          timestamp: timestamp + 1,
        },
      ],
      windowState: {
        position: { x: 220, y: 160 },
        size: { width: 420, height: 520 },
        collapsed: false,
        anchorOffset: { x: 40, y: 40 },
        queueExpanded: false,
        clearPreviousAssistant: false,
        activeAnchorChatId: chatId,
      },
      createdAt: timestamp,
      lastActive: timestamp,
    };

    await setExtensionStorage(context, extensionId, {
      [storageKey]: {
        pageUrl,
        sessions: {
          [chatId]: session,
        },
        lastUpdated: timestamp,
      },
    });

    const page = await context.newPage();
    await page.goto(pageUrl);
    await page.evaluate((chatIdValue) => {
      document.body.innerHTML = `
        <main>
          <div id="markdown-anchor" data-nabokov-chat-id="${chatIdValue}">Markdown Anchor</div>
          <div id="markdown-secondary" data-nabokov-chat-id="${chatIdValue}" style="margin-top: 400px;">Secondary Anchor</div>
        </main>
      `;
    }, chatId);

    await sendMessageToContentScript(context, { type: 'ACTIVATE_CHAT_SELECTOR' });
    await page.waitForTimeout(500);
    await page.click('#markdown-anchor');
    await page.waitForSelector('[data-nabokov-element-chat]');

    const chatContainer = await page.$('[data-nabokov-element-chat]');
    const containerId = await chatContainer?.getAttribute('id');
    expect(containerId).toBeTruthy();
    await waitForShadowRoot(page, containerId!);

    await page.waitForFunction(
      (hostId: string) => {
        const host = document.getElementById(hostId);
        if (!host?.shadowRoot) return false;
        return Boolean(host.shadowRoot.querySelector('a[href="https://docs.example"]'));
      },
      containerId!,
      { timeout: 3000 }
    );

    const linkInfo = await page.evaluate((hostId: string) => {
      const host = document.getElementById(hostId);
      const anchor = host?.shadowRoot?.querySelector('a[href="https://docs.example"]') as HTMLAnchorElement | null;
      if (!anchor) return null;
      return {
        text: anchor.textContent,
        target: anchor.target,
      };
    }, containerId!);

    expect(linkInfo).toEqual({ text: 'Docs', target: '_blank' });

    await page.close();
  });
});
