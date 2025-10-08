/**
 * E2E Tests for Keyboard Shortcuts
 *
 * Tests content script message handlers for keyboard shortcuts (Mac):
 * - Command+Shift+E (Stash mode) → ACTIVATE_SELECTOR with stashImmediately: true
 * - Control+Shift+E (Canvas mode) → ACTIVATE_SELECTOR with stashImmediately: false
 * - Control+Shift+C (Inline chat) → OPEN_INLINE_CHAT
 *
 * Note: These tests send messages directly to the content script via the background worker
 * since Playwright cannot trigger Chrome keyboard shortcuts.
 */

import { test, expect } from '../fixtures/extension';
import type { Page, BrowserContext, Worker } from '@playwright/test';

// Helper to get tab ID for a page
async function getTabId(context: BrowserContext, page: Page): Promise<number> {
  const serviceWorker = await getServiceWorker(context);

  const tabs = await serviceWorker.evaluate(async () => {
    return await chrome.tabs.query({ active: true, currentWindow: true });
  });

  return tabs && tabs.length > 0 && tabs[0].id ? tabs[0].id : 0;
}

// Helper to get service worker
async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  return serviceWorker;
}

// Helper to send message to content script
async function sendMessageToContentScript(
  context: BrowserContext,
  page: Page,
  message: any
): Promise<void> {
  const serviceWorker = await getServiceWorker(context);

  // Always use fallback approach - find the right tab
  await serviceWorker.evaluate(async (msg: any) => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        try {
          await chrome.tabs.sendMessage(tab.id, msg);
          console.log('[Test Helper] Message sent to tab:', tab.id, tab.url);
          break;
        } catch (e) {
          console.log('[Test Helper] Failed to send to tab:', tab.id, e);
        }
      }
    }
  }, message);
}

// Helper to wait for Shadow DOM element
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

test.describe('Keyboard Shortcuts - Content Script Handlers', () => {
  test.describe('Control+Shift+E (Stash Mode)', () => {
    test('should activate element selector in stash mode', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('https://example.com');
      await page.waitForLoadState('networkidle');

      console.log('[Test] Sending ACTIVATE_SELECTOR message (stash mode)...');

      // Send message to activate stash mode
      await sendMessageToContentScript(context, page, {
        type: 'ACTIVATE_SELECTOR',
        payload: {
          stashImmediately: true
        }
      });

      await page.waitForTimeout(2000);

      // Check if Shadow DOM container exists
      const hasShadowRoot = await waitForShadowRoot(page, 'nabokov-clipper-root');
      expect(hasShadowRoot).toBe(true);

      console.log('[Test] ✅ Element selector activated in stash mode');

      await page.close();
    });

    test('should display STASH MODE indicator', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('https://example.com');
      await page.waitForLoadState('networkidle');

      await sendMessageToContentScript(context, page, {
        type: 'ACTIVATE_SELECTOR',
        payload: { stashImmediately: true }
      });

      await page.waitForTimeout(2000);

      const shadowContent = await page.evaluate(() => {
        const container = document.querySelector('#nabokov-clipper-root');
        if (!container || !container.shadowRoot) return '';
        return container.shadowRoot.textContent || '';
      });

      const hasStashIndicator = shadowContent.includes('STASH MODE') || shadowContent.includes('📥');
      expect(hasStashIndicator).toBe(true);

      console.log('[Test] ✅ STASH MODE indicator displayed');

      await page.close();
    });

    test('should close on ESC key', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('https://example.com');
      await page.waitForLoadState('networkidle');

      await sendMessageToContentScript(context, page, {
        type: 'ACTIVATE_SELECTOR',
        payload: { stashImmediately: true }
      });

      await page.waitForTimeout(1500);

      const hasShadowBefore = await waitForShadowRoot(page, 'nabokov-clipper-root');
      expect(hasShadowBefore).toBe(true);

      // Press ESC to close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      const hasShadowAfter = await page.evaluate(() => {
        return document.querySelector('#nabokov-clipper-root') !== null;
      });

      expect(hasShadowAfter).toBe(false);
      console.log('[Test] ✅ Selector closed on ESC');

      await page.close();
    });
  });

  test.describe('Control+Shift+C (Inline Chat)', () => {
    test('should open inline chat window', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('https://example.com');
      await page.waitForLoadState('networkidle');

      console.log('[Test] Sending OPEN_INLINE_CHAT message...');

      await sendMessageToContentScript(context, page, {
        type: 'OPEN_INLINE_CHAT'
      });

      await page.waitForTimeout(2000);

      const hasChatContainer = await page.evaluate(() => {
        const container = document.querySelector('#nabokov-inline-chat-root');
        return container !== null && container.shadowRoot !== null;
      });

      expect(hasChatContainer).toBe(true);
      console.log('[Test] ✅ Inline chat window opened');

      await page.close();
    });

    test('should have chat input field', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('https://example.com');
      await page.waitForLoadState('networkidle');

      await sendMessageToContentScript(context, page, {
        type: 'OPEN_INLINE_CHAT'
      });

      await page.waitForTimeout(2000);

      const hasInputField = await page.evaluate(() => {
        const container = document.querySelector('#nabokov-inline-chat-root');
        if (!container || !container.shadowRoot) return false;

        const input = container.shadowRoot.querySelector('input, textarea');
        return input !== null;
      });

      expect(hasInputField).toBe(true);
      console.log('[Test] ✅ Chat input field exists');

      await page.close();
    });

    test('should toggle (open then close)', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('https://example.com');
      await page.waitForLoadState('networkidle');

      // Open
      await sendMessageToContentScript(context, page, {
        type: 'OPEN_INLINE_CHAT'
      });

      await page.waitForTimeout(1500);

      const openedFirst = await page.evaluate(() => {
        return document.querySelector('#nabokov-inline-chat-root') !== null;
      });

      expect(openedFirst).toBe(true);
      console.log('[Test] ✅ Chat opened');

      // Close
      await sendMessageToContentScript(context, page, {
        type: 'CLOSE_INLINE_CHAT'
      });

      await page.waitForTimeout(500);

      const closedAfter = await page.evaluate(() => {
        return document.querySelector('#nabokov-inline-chat-root') === null;
      });

      expect(closedAfter).toBe(true);
      console.log('[Test] ✅ Chat closed');

      await page.close();
    });
  });

  test.describe('Command+Shift+E (Canvas Mode)', () => {
    test('should activate element selector in canvas mode', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('https://example.com');
      await page.waitForLoadState('networkidle');

      console.log('[Test] Sending ACTIVATE_SELECTOR message (canvas mode)...');

      await sendMessageToContentScript(context, page, {
        type: 'ACTIVATE_SELECTOR',
        payload: {
          stashImmediately: false
        }
      });

      await page.waitForTimeout(2000);

      const hasShadowRoot = await waitForShadowRoot(page, 'nabokov-clipper-root');
      expect(hasShadowRoot).toBe(true);

      console.log('[Test] ✅ Element selector activated in canvas mode');

      await page.close();
    });

    test('should display CANVAS MODE indicator', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto('https://example.com');
      await page.waitForLoadState('networkidle');

      await sendMessageToContentScript(context, page, {
        type: 'ACTIVATE_SELECTOR',
        payload: { stashImmediately: false }
      });

      await page.waitForTimeout(2000);

      const shadowContent = await page.evaluate(() => {
        const container = document.querySelector('#nabokov-clipper-root');
        if (!container || !container.shadowRoot) return '';
        return container.shadowRoot.textContent || '';
      });

      const hasCanvasIndicator = shadowContent.includes('CANVAS MODE') || shadowContent.includes('🎨');
      expect(hasCanvasIndicator).toBe(true);

      console.log('[Test] ✅ CANVAS MODE indicator displayed');

      await page.close();
    });
  });
});
