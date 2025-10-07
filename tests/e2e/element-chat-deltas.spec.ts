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

    await context.route('http://localhost:3100/api/stream', async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'Content-Type',
          },
          body: '',
        });
        return;
      }

      const sseBody = [
        'data: {"delta":{"text":"First delta chunk"}}',
        '',
        'data: {"delta":{"text":"Second delta chunk"}}',
        '',
        'data: {"delta":{"text":"Third delta chunk"}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          Connection: 'keep-alive',
        },
        body: sseBody,
      });
    });

    await page.goto(TEST_URL);
    await page.waitForLoadState('domcontentloaded');

    await sendMessageToContentScript(context, page, { type: 'ACTIVATE_CHAT_SELECTOR' });
    await page.waitForTimeout(1000);
    await waitForShadowRoot(page, 'nabokov-clipper-root');

    const heading = await page.$('h1');
    expect(heading).not.toBeNull();
    await heading!.click();
    await page.waitForTimeout(1500);

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

    await page.waitForFunction(() => {
      const deltas = (window as any).__NABOKOV_DEBUG_LAST_DELTAS__;
      return Array.isArray(deltas) && deltas.length === 3;
    });

    const debugSnapshot = await page.evaluate(() => ({
      deltas: (window as any).__NABOKOV_DEBUG_LAST_DELTAS__ || [],
      active: (window as any).__NABOKOV_DEBUG_STREAMING_DELTAS__ || [],
      style: (window as any).__NABOKOV_DEBUG_STREAMING_STYLE__ || null,
    }));

    expect(debugSnapshot.deltas).toEqual([
      'First delta chunk',
      'Second delta chunk',
      'Third delta chunk',
    ]);
    expect(debugSnapshot.active).toEqual([]);
    expect(debugSnapshot.style?.overflowY).toBe('auto');
    expect(debugSnapshot.style?.maxHeight).toBe('200px');

    await page.waitForFunction((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      return !shadow?.querySelector('[data-message-streaming="true"]');
    }, hostId, { timeout: 5000 });

    const reasoningInitialState = await page.evaluate((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      if (!shadow) {
        return null;
      }

      const toggle = shadow.querySelector('[data-reasoning-toggle]') as HTMLElement | null;
      const reasoningContent = shadow.querySelector('[data-reasoning-content]') as HTMLElement | null;
      const lastAssistant = shadow.querySelector('[data-message-role="assistant"]:last-of-type') as HTMLElement | null;

      return {
        hasToggle: Boolean(toggle),
        reasoningVisible: Boolean(reasoningContent),
        lastAssistantText: lastAssistant?.textContent || '',
      };
    }, hostId);

    expect(reasoningInitialState?.hasToggle).toBe(true);
    expect(reasoningInitialState?.reasoningVisible).toBe(false);
    expect(reasoningInitialState?.lastAssistantText).toContain('Second delta chunk');
    expect(reasoningInitialState?.lastAssistantText).not.toContain('First delta chunk');

    await page.evaluate((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      const toggle = shadow?.querySelector('[data-reasoning-toggle]') as HTMLElement | null;
      toggle?.click();
    }, hostId);

    await page.waitForFunction((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      return Boolean(shadow?.querySelector('[data-reasoning-content]'));
    }, hostId);

    const reasoningText = await page.evaluate((id) => {
      const host = document.getElementById(id);
      const shadow = host?.shadowRoot;
      const reasoning = shadow?.querySelector('[data-reasoning-content]');
      return reasoning?.textContent || '';
    }, hostId);

    expect(reasoningText).toContain('First delta chunk');

    await page.close();
  });
});
