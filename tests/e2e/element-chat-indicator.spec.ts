/**
 * Element Chat Indicator E2E Tests
 *
 * Validates that saved element chat sessions render red dot badges
 * on matching DOM elements and that the indicators stay aligned
 * while scrolling.
 */

import { test, expect, clearExtensionStorage, setExtensionStorage } from '../fixtures/extension';
import type { ElementChatSession } from '@/types/elementChat';
import type { ElementDescriptor } from '@/services/elementIdService';

function computeStorageKey(pageUrl: string): string {
  let hash = 0;
  for (let i = 0; i < pageUrl.length; i += 1) {
    const char = pageUrl.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }

  const hashStr = Math.abs(hash).toString(36);
  return `nabokov_element_chats_${hashStr}`;
}

test.describe('Element Chat Indicators', () => {
  test.beforeEach(async ({ context }) => {
    await clearExtensionStorage(context);
  });

  test('renders badge for stored session and keeps alignment after scroll', async ({ context }) => {
    const timestamp = Date.now();
    const testUrl = `https://example.com/element-chat-indicator-test?ts=${timestamp}`;
    const elementChatId = 'test-indicator-element';

    const descriptor: ElementDescriptor = {
      chatId: elementChatId,
      tagName: 'div',
      id: 'indicator-target',
      classes: ['indicator-target'],
      cssSelector: '#indicator-target',
      xpath: '//*[@id="indicator-target"]',
      textPreview: 'Indicator target for saved chat',
      boundingRect: {
        top: 400,
        left: 160,
        width: 200,
        height: 60,
      },
    };

    const session: ElementChatSession = {
      chatId: `chat-${timestamp}`,
      elementId: elementChatId,
      pageUrl: testUrl,
      elementDescriptor: descriptor,
      elementDescriptors: [descriptor],
      elementIds: [elementChatId],
      messages: [],
      windowState: {
        position: { x: 820, y: 320 },
        size: { width: 360, height: 480 },
        collapsed: false,
      },
      createdAt: timestamp,
      lastActive: timestamp,
    };

    const storageKey = computeStorageKey(testUrl);
    await setExtensionStorage(context, {
      [storageKey]: {
        pageUrl: testUrl,
        sessions: {
          [elementChatId]: session,
        },
        lastUpdated: timestamp,
      },
    });

    const page = await context.newPage();
    await page.goto(testUrl);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(({ elementChatId }) => {
      const container = document.createElement('div');
      container.style.height = '1500px';
      container.style.paddingTop = '320px';
      container.style.display = 'flex';
      container.style.justifyContent = 'center';

      const target = document.createElement('div');
      target.id = 'indicator-target';
      target.setAttribute('data-nabokov-chat-id', elementChatId);
      target.textContent = 'Saved element chat target';
      target.style.width = '240px';
      target.style.height = '120px';
      target.style.padding = '24px';
      target.style.background = '#f5f5f5';
      target.style.border = '2px dashed #333';

      container.appendChild(target);
      document.body.innerHTML = '';
      document.body.appendChild(container);
    }, { elementChatId });

    // Allow content script to bootstrap indicator service
    await page.waitForTimeout(1500);

    const badgeLocator = page.locator(`[data-nabokov-chat-indicator="${elementChatId}"]`);
    await expect(badgeLocator).toBeVisible({ timeout: 5000 });
    await expect(badgeLocator).toHaveCount(1);

    const elementBoxBeforeScroll = await page.locator('#indicator-target').boundingBox();
    const badgeBoxBeforeScroll = await badgeLocator.boundingBox();

    expect(elementBoxBeforeScroll).not.toBeNull();
    expect(badgeBoxBeforeScroll).not.toBeNull();

    await page.evaluate(() => window.scrollTo({ top: 800, left: 0, behavior: 'instant' }));
    await page.waitForTimeout(250);

    await expect(badgeLocator).toBeVisible();

    const elementBoxAfterScroll = await page.locator('#indicator-target').boundingBox();
    const badgeBoxAfterScroll = await badgeLocator.boundingBox();

    expect(elementBoxAfterScroll).not.toBeNull();
    expect(badgeBoxAfterScroll).not.toBeNull();

    if (elementBoxAfterScroll && badgeBoxAfterScroll) {
      const horizontalDelta = Math.abs(
        (badgeBoxAfterScroll.x + badgeBoxAfterScroll.width / 2) -
        (elementBoxAfterScroll.x + elementBoxAfterScroll.width)
      );
      const verticalDelta = Math.abs(
        (badgeBoxAfterScroll.y + badgeBoxAfterScroll.height / 2) -
        elementBoxAfterScroll.y
      );

      expect(horizontalDelta).toBeLessThan(32);
      expect(verticalDelta).toBeLessThan(32);
    }
  });
});
