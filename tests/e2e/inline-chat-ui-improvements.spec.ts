import { test, expect } from '../fixtures/extension';
import type { BrowserContext, Page, Worker } from '@playwright/test';

const TEST_URL = 'https://example.com';
const INLINE_CHAT_HOST_ID = 'nabokov-inline-chat-root';

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
  message: any,
): Promise<any> {
  const serviceWorker = await getServiceWorker(context);
  const targetUrl = page.url();
  return serviceWorker.evaluate(async ({ msg, target }) => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (
        tab.id &&
        tab.url &&
        !tab.url.startsWith('chrome://') &&
        !tab.url.startsWith('chrome-extension://') &&
        tab.url.startsWith(target)
      ) {
        try {
          return await chrome.tabs.sendMessage(tab.id, msg);
        } catch (error) {
          console.warn('[Test] Failed to send message to tab', tab.id, error);
        }
      }
    }
    return null;
  }, { msg: message, target: targetUrl });
}

async function setupInlineChat(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.on('console', message => {
    console.log(`[inline-chat] ${message.type().toUpperCase()}: ${message.text()}`);
  });
  await page.goto(TEST_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  await sendMessageToContentScript(context, page, { type: 'ENABLE_INLINE_CHAT_TEST_MODE' });
  await sendMessageToContentScript(context, page, { type: 'OPEN_INLINE_CHAT' });
  await page.waitForFunction((hostId) => document.getElementById(hostId) !== null, INLINE_CHAT_HOST_ID, {
    timeout: 5000,
  });
  return page;
}

async function addInlineUser(
  context: BrowserContext,
  page: Page,
  content: string,
): Promise<void> {
  await sendMessageToContentScript(context, page, {
    type: 'INLINE_CHAT_TEST_ADD_USER',
    payload: { content },
  });
}

async function addInlineAssistant(
  context: BrowserContext,
  page: Page,
  content: string,
): Promise<void> {
  await sendMessageToContentScript(context, page, {
    type: 'INLINE_CHAT_TEST_ADD_ASSISTANT',
    payload: { content },
  });
}

async function setInlineStreaming(
  context: BrowserContext,
  page: Page,
  processing: boolean,
): Promise<void> {
  await sendMessageToContentScript(context, page, {
    type: 'INLINE_CHAT_TEST_SET_STREAMING',
    payload: { processing },
  });
}

async function setInlineQueue(
  context: BrowserContext,
  page: Page,
  count: number,
): Promise<void> {
  await sendMessageToContentScript(context, page, {
    type: 'INLINE_CHAT_TEST_SET_QUEUE',
    payload: { count },
  });
}

async function getInlineCounts(context: BrowserContext, page: Page) {
  const response = await sendMessageToContentScript(context, page, {
    type: 'INLINE_CHAT_TEST_GET_COUNTS',
  });
  return response ?? { assistantCount: 0, userCount: 0, unreadCount: '0', collapsed: false };
}

async function typeInlineTextarea(page: Page, value: string): Promise<void> {
  await page.evaluate(({ hostId, text }) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const textarea = shadow?.querySelector('textarea') as HTMLTextAreaElement | null;
    if (!textarea) throw new Error('Inline chat textarea not found');
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }, { hostId: INLINE_CHAT_HOST_ID, text: value });
}

async function clickInlineSend(page: Page): Promise<void> {
  await page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const button = shadow?.querySelector('[data-testid="inline-chat-send"]') as HTMLButtonElement | null;
    if (!button) throw new Error('Inline chat send button not found');
    button.click();
  }, INLINE_CHAT_HOST_ID);
}

async function waitForAssistantMessageCount(context: BrowserContext, page: Page, expected: number): Promise<void> {
  await expect.poll(async () => {
    const counts = await getInlineCounts(context, page);
    return counts.assistantCount;
  }).toBe(expected);
}

async function getMessageContainerMetrics(page: Page) {
  return page.evaluate(({ hostId }) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const container = shadow?.querySelector('[data-testid="inline-chat-messages"]') as HTMLElement | null;
    if (!container) return null;
    return {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    };
  }, { hostId: INLINE_CHAT_HOST_ID });
}

async function setMessageContainerScroll(page: Page, position: 'top' | 'bottom'): Promise<void> {
  await page.evaluate(({ hostId, pos }) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const container = shadow?.querySelector('[data-testid="inline-chat-messages"]') as HTMLElement | null;
    if (!container) return;
    if (pos === 'top') {
      container.scrollTop = 0;
    } else {
      container.scrollTop = container.scrollHeight;
    }
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, { hostId: INLINE_CHAT_HOST_ID, pos: position });
}

async function getCollapseButtonText(page: Page): Promise<string> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const button = shadow?.querySelector('[data-testid="inline-chat-collapse"]');
    return button?.textContent?.trim() ?? '';
  }, INLINE_CHAT_HOST_ID);
}

async function clickCollapseButton(page: Page): Promise<void> {
  await page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const button = shadow?.querySelector('[data-testid="inline-chat-collapse"]') as HTMLButtonElement | null;
    button?.click();
  }, INLINE_CHAT_HOST_ID);
}

async function isInlineChatCollapsed(page: Page): Promise<boolean> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const messages = shadow?.querySelector('[data-testid="inline-chat-messages"]');
    return !messages;
  }, INLINE_CHAT_HOST_ID);
}

async function getCollapseUnreadCount(page: Page): Promise<string | null> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const button = shadow?.querySelector('[data-testid="inline-chat-collapse"]');
    return button?.getAttribute('data-unread-count') ?? null;
  }, INLINE_CHAT_HOST_ID);
}

async function setSelectionFromAssistant(page: Page): Promise<void> {
  await page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const assistantContainer = shadow?.querySelector('[data-message-role="assistant"]') as HTMLElement | null;
    const assistant = assistantContainer?.querySelector('[data-testid="inline-chat-message-text"]') as HTMLElement | null
      || assistantContainer;
    if (!assistant) throw new Error('Assistant message text not found');
    const range = document.createRange();
    range.selectNodeContents(assistant);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, INLINE_CHAT_HOST_ID);
}

async function getTextareaValue(page: Page): Promise<string> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const textarea = shadow?.querySelector('textarea') as HTMLTextAreaElement | null;
    return textarea?.value ?? '';
  }, INLINE_CHAT_HOST_ID);
}

async function isSendButtonDisabled(page: Page): Promise<boolean> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const button = shadow?.querySelector('[data-testid="inline-chat-send"]') as HTMLButtonElement | null;
    return Boolean(button?.disabled);
  }, INLINE_CHAT_HOST_ID);
}

async function dispatchDragEvent(
  page: Page,
  selector: 'messages' | 'input',
  type: 'dragover' | 'dragleave',
): Promise<void> {
  await page.evaluate(({ hostId, target, eventType }) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const container = target === 'messages'
      ? shadow?.querySelector('[data-testid="inline-chat-messages"]')
      : shadow?.querySelector('textarea')?.parentElement;
    if (!container) throw new Error('Drag target not found');

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([''], 'fake.png', { type: 'image/png' }));

    const event = new DragEvent(eventType, {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      relatedTarget: null,
    });
    container.dispatchEvent(event);
  }, { hostId: INLINE_CHAT_HOST_ID, target: selector, eventType: type });
}

async function hasInputDragOverlay(page: Page): Promise<boolean> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    return Boolean(shadow?.querySelector('[data-testid="inline-input-drop-overlay"]'));
  }, INLINE_CHAT_HOST_ID);
}

async function waitForStatusPill(page: Page, testId: string): Promise<void> {
  await expect.poll(() => page.evaluate(({ hostId, pill }) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    return Boolean(shadow?.querySelector(`[data-testid="${pill}"]`));
  }, { hostId: INLINE_CHAT_HOST_ID, pill: testId })).toBe(true);
}

async function getCollapseLabel(page: Page): Promise<string> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const label = shadow?.querySelector('[data-testid="inline-chat-collapse"] span:nth-child(2)');
    return label?.textContent?.trim() ?? '';
  }, INLINE_CHAT_HOST_ID);
}

async function getCollapseBadgeText(page: Page): Promise<string | null> {
  return page.evaluate((hostId) => {
    const host = document.getElementById(hostId);
    const shadow = host?.shadowRoot;
    const badge = shadow?.querySelector('[data-testid="inline-chat-collapse"] span:nth-child(3)');
    return badge?.textContent?.trim() ?? null;
  }, INLINE_CHAT_HOST_ID);
}

test.describe('Inline Chat UI improvements', () => {
  test('does not auto-scroll when user is reviewing earlier messages', async ({ context }) => {
    const page = await setupInlineChat(context);

    const longText = Array.from({ length: 40 }, (_, i) => `• Detail line ${i + 1}`).join('\n');

    await page.evaluate((hostId) => {
      const host = document.getElementById(hostId);
      const shadow = host?.shadowRoot;
      const container = shadow?.querySelector('[data-testid="inline-chat-messages"]') as HTMLElement | null;
      if (container) {
        container.style.maxHeight = '220px';
        container.style.overflowY = 'auto';
      }
    }, INLINE_CHAT_HOST_ID);

    await addInlineUser(context, page, 'Initial question');
    await addInlineAssistant(context, page, 'First assistant reply.');
    await waitForAssistantMessageCount(context, page, 1);

    await addInlineUser(context, page, 'Give me a very detailed answer');
    await addInlineAssistant(context, page, longText);
    await waitForAssistantMessageCount(context, page, 2);

    await addInlineUser(context, page, 'More detail please');
    await addInlineAssistant(context, page, `${longText}\n${longText}`);
    await waitForAssistantMessageCount(context, page, 3);

    const metrics = await getMessageContainerMetrics(page);
    expect(metrics).not.toBeNull();
    expect((metrics!.scrollHeight ?? 0) > (metrics!.clientHeight ?? 0)).toBeTruthy();

    await setMessageContainerScroll(page, 'top');
    const before = await getMessageContainerMetrics(page);

    await addInlineUser(context, page, 'Another follow-up');
    await addInlineAssistant(context, page, 'Follow-up response');
    await waitForAssistantMessageCount(context, page, 4);

    const after = await getMessageContainerMetrics(page);
    expect(after).not.toBeNull();
    expect((after!.scrollHeight ?? 0) > (after!.clientHeight ?? 0)).toBeTruthy();
    expect(before && after && Math.round(before.scrollTop ?? 0)).toBe(0);
    expect(after!.scrollTop).toBeLessThan(40);

    await page.close();
  });

  test('pressing Enter with highlighted chat text moves it into the composer', async ({ context }) => {
    const page = await setupInlineChat(context);

    await addInlineUser(context, page, 'Summarize inline chat behaviour');
    await addInlineAssistant(context, page, 'Assistant summary about inline chat');
    await waitForAssistantMessageCount(context, page, 1);

    await setSelectionFromAssistant(page);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const value = await getTextareaValue(page);
    expect(value).toContain('Assistant summary');

    await page.close();
  });

  test('send button stays enabled while a response is streaming', async ({ context }) => {
    const page = await setupInlineChat(context);

    await setInlineStreaming(context, page, true);
    await waitForStatusPill(page, 'status-pill-processing');

    await typeInlineTextarea(page, 'Second question while processing');
    expect(await isSendButtonDisabled(page)).toBeFalsy();

    await setInlineStreaming(context, page, false);
    await addInlineAssistant(context, page, 'Queued response completed');
    await waitForAssistantMessageCount(context, page, 1);
    await waitForStatusPill(page, 'status-pill-complete');

    await page.close();
  });

  test('collapse button shows last message context and remains collapsed after dragging', async ({ context }) => {
    const page = await setupInlineChat(context);

    await addInlineUser(context, page, 'Share insight');
    await addInlineAssistant(context, page, 'Assistant insight');
    await waitForAssistantMessageCount(context, page, 1);

    const label = await getCollapseButtonText(page);
    expect(label).toContain('Last:');

    await clickCollapseButton(page);
    expect(await isInlineChatCollapsed(page)).toBe(true);

    const dragPoint = await page.evaluate(({ hostId }) => {
      const host = document.getElementById(hostId);
      const shadow = host?.shadowRoot;
      const handle = shadow?.querySelector('.drag-handle') as HTMLElement | null;
      if (!handle) throw new Error('Drag handle not found');
      const rect = handle.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, { hostId: INLINE_CHAT_HOST_ID });

    await page.mouse.move(dragPoint.x, dragPoint.y);
    await page.mouse.down();
    await page.mouse.move(dragPoint.x + 80, dragPoint.y + 40, { steps: 10 });
    await page.mouse.up();

    expect(await isInlineChatCollapsed(page)).toBe(true);
    expect(await getCollapseButtonText(page)).toContain('Expand');

    await page.close();
  });

  test('collapsed chat shows unread badge and queued state', async ({ context }) => {
    const page = await setupInlineChat(context);

    await addInlineUser(context, page, 'Initial prompt');
    await addInlineAssistant(context, page, 'Assistant availability');
    await waitForAssistantMessageCount(context, page, 1);

    await clickCollapseButton(page);
    expect(await isInlineChatCollapsed(page)).toBe(true);
    expect(await getCollapseUnreadCount(page)).toBe('0');

    await setInlineStreaming(context, page, true);
    await setInlineQueue(context, page, 2);
    await expect.poll(() => getCollapseBadgeText(page)).toBe('1');

    await setInlineStreaming(context, page, false);
    await setInlineQueue(context, page, 0);
    await addInlineAssistant(context, page, 'Queued response chunk 1');
    await waitForAssistantMessageCount(context, page, 2);
    await expect.poll(() => getCollapseUnreadCount(page)).toBe('1');

    await clickCollapseButton(page);
    expect(await getCollapseUnreadCount(page)).toBe('0');

    await page.close();
  });

  test('image drop overlay only appears over the input container', async ({ context }) => {
    const page = await setupInlineChat(context);

    await addInlineUser(context, page, 'Check overlay');
    await addInlineAssistant(context, page, 'Assistant ready');
    await waitForAssistantMessageCount(context, page, 1);

    expect(await hasInputDragOverlay(page)).toBe(false);

    await dispatchDragEvent(page, 'messages', 'dragover');
    expect(await hasInputDragOverlay(page)).toBe(false);

    await dispatchDragEvent(page, 'input', 'dragover');
    expect(await hasInputDragOverlay(page)).toBe(true);

    await dispatchDragEvent(page, 'input', 'dragleave');
    await expect.poll(() => hasInputDragOverlay(page)).toBe(false);

    await page.close();
  });

  test('status pills reflect processing and completion states', async ({ context }) => {
    const page = await setupInlineChat(context);

    await setInlineStreaming(context, page, true);
    await waitForStatusPill(page, 'status-pill-processing');
    await setInlineStreaming(context, page, false);
    await waitForStatusPill(page, 'status-pill-complete');

    await page.close();
  });
});
