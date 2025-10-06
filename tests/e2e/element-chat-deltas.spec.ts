import { test, expect } from '../fixtures/extension';
import type { BrowserContext, Page } from '@playwright/test';

const TEST_URL = 'https://example.com';

async function getServiceWorker(context: BrowserContext) {
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
        } catch (error) {
          console.warn('[Test Helper] Failed to send message to tab', tab.id, error);
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
      return host?.shadowRoot !== null;
    }, hostId);

    if (hasShadowRoot) {
      return true;
    }

    await page.waitForTimeout(100);
  }
  return false;
}

async function typeShadowTextarea(page: Page, hostId: string, selector: string, text: string) {
  await page.evaluate(({ id, sel, value }) => {
    const host = document.getElementById(id);
    if (!host?.shadowRoot) throw new Error('Shadow root not found');
    const textarea = host.shadowRoot.querySelector(sel) as HTMLTextAreaElement | null;
    if (!textarea) throw new Error(`Textarea not found: ${sel}`);
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id: hostId, sel: selector, value: text });
}

async function clickShadowElement(page: Page, hostId: string, selector: string) {
  await page.evaluate(({ id, sel }) => {
    const host = document.getElementById(id);
    if (!host?.shadowRoot) throw new Error('Shadow root not found');
    const element = host.shadowRoot.querySelector(sel) as HTMLElement | null;
    if (!element) throw new Error(`Element not found: ${sel}`);
    element.click();
  }, { id: hostId, sel: selector });
}

test.describe('Element Chat Streaming Deltas', () => {
  test('renders each streaming delta as its own responsive line', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(TEST_URL);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(() => {
      (window as any).__NABOKOV_TEST_STREAM__ = {
        chunks: ['First delta chunk', 'Second delta chunk', 'Third delta chunk'],
        delay: 120,
      };
    });

    await sendMessageToContentScript(context, page, { type: 'ACTIVATE_CHAT_SELECTOR' });
    await page.waitForTimeout(600);

    const heading = await page.$('h1');
    expect(heading).not.toBeNull();
    await heading!.click();

    await page.waitForFunction(() => document.querySelector('[data-nabokov-element-chat]') !== null);
    const chatContainer = await page.$('[data-nabokov-element-chat]');
    expect(chatContainer).not.toBeNull();

    const containerId = await chatContainer!.getAttribute('id');
    expect(containerId).toBeTruthy();
    const hostId = containerId as string;

    const shadowReady = await waitForShadowRoot(page, hostId);
    expect(shadowReady).toBe(true);

    await typeShadowTextarea(page, hostId, 'textarea', 'show me streaming deltas');
    await clickShadowElement(page, hostId, 'button[title="Send message"]');

    await page.waitForFunction((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      return !!shadow?.querySelector('[data-message-streaming="true"]');
    }, hostId);

    await page.waitForFunction((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      const deltaLines = shadow?.querySelectorAll('[data-message-streaming="true"] [data-delta-index]');
      return (deltaLines?.length || 0) === 3;
    }, hostId);

    const streamingSnapshot = await page.evaluate((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      if (!shadow) return { deltas: [], overflowY: '', maxHeight: '' };
      const streamingNode = shadow.querySelector('[data-message-streaming="true"]');
      if (!streamingNode) return { deltas: [], overflowY: '', maxHeight: '' };
      const lines = Array.from(streamingNode.querySelectorAll('[data-delta-index]')) as HTMLElement[];
      const container = streamingNode.querySelector('[data-delta-index]')?.parentElement as HTMLElement | null;
      const styles = container ? window.getComputedStyle(container) : null;
      return {
        deltas: lines.map(line => line.textContent?.trim() || ''),
        overflowY: styles?.overflowY || '',
        maxHeight: styles?.maxHeight || '',
      };
    }, hostId);

    expect(streamingSnapshot.deltas).toEqual([
      'First delta chunk',
      'Second delta chunk',
      'Third delta chunk',
    ]);
    expect(streamingSnapshot.overflowY).toBe('auto');
    expect(streamingSnapshot.maxHeight).toBe('200px');

    await page.waitForFunction((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      return !shadow?.querySelector('[data-message-streaming="true"]');
    }, hostId, { timeout: 5000 });

    const assistantMessages = await page.evaluate((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      if (!shadow) return [];
      const nodes = Array.from(shadow.querySelectorAll('[data-message-role="assistant"]')) as HTMLElement[];
      return nodes.map(node => node.textContent?.trim() || '');
    }, hostId);

    expect(assistantMessages.some(text => text.includes('First delta chunk'))).toBe(true);

    await page.close();
  });
});
