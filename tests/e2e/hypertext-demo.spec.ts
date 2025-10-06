import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_PATH = path.resolve(__dirname, '../../claude_html_demo/hypertext_navigation_demo.html');
const DEMO_URL = `file://${DEMO_PATH}`;

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });
});

async function highlightGradientDescent(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const article = document.getElementById('article');
    if (!article) return;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, null);
    let node = null;
    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (current.nodeType === Node.TEXT_NODE && current.textContent && current.textContent.toLowerCase().includes('gradient descent')) {
        node = current;
        break;
      }
    }
    if (!node) return;
    const text = node.textContent || '';
    const start = text.toLowerCase().indexOf('gradient');
    if (start === -1) return;
    const end = start + 'gradient descent'.length;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, Math.min(end, text.length));
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function ensureExperienceReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => typeof (window as any).hypertextExperience !== 'undefined');
}

async function triggerPalette(page: import('@playwright/test').Page) {
  await ensureExperienceReady(page);
  await page.evaluate(() => {
    const experience = (window as any).hypertextExperience;
    if (!experience || typeof experience.triggerFromExternal !== 'function') {
      throw new Error('hypertext experience not initialised');
    }
    experience.triggerFromExternal();
  });
}

test.describe('Hypertext navigation demo', () => {
  test('Cmd/Ctrl+Shift+K opens the hypertext palette', async ({ page }) => {
    await page.goto(DEMO_URL);

    await ensureExperienceReady(page);
    await highlightGradientDescent(page);

    await triggerPalette(page);

    const palette = page.locator('.hx-palette');
    await expect(palette).toBeVisible();
    await expect(palette.locator('.hx-selected-text')).toHaveText(/gradient descent/i);
  });

  test('Default context includes full page text and selection without truncation', async ({ page }) => {
    let capturedContext: string | null = null;

    await page.route('http://localhost:3100/api/stream', async route => {
      const request = route.request();
      const payload = request.postDataJSON();
      const userMessage = [...payload.messages].reverse().find((m: any) => m.role === 'user');
      capturedContext = userMessage?.content || null;

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: 'data: {"delta":{"text":"{\\"pillText\\":\\"Context OK\\",\\"mode\\":\\"inline\\"}"}}\n\n'
          + 'data: [DONE]\n'
      });
    });

    await page.goto(DEMO_URL);
    await ensureExperienceReady(page);
    await highlightGradientDescent(page);
    await triggerPalette(page);
    await page.locator('#hx-generate-button').click();

    await expect.poll(() => capturedContext, { message: 'context to be captured' }).not.toBeNull();

    const context = capturedContext!;
    expect(context).toContain('--- FULL PAGE TEXT ---');
    expect(context).toContain('Machine learning practitioners often reach for');
    expect(context).toContain('--- CURRENT SELECTION ---');
    expect(context).toMatch(/gradient descent/i);
    expect(context).not.toContain('[Context truncated');
  });

  test('Truncation toggle limits context length and adds marker', async ({ page }) => {
    let capturedContext: string | null = null;

    await page.route('http://localhost:3100/api/stream', async route => {
      const request = route.request();
      const payload = request.postDataJSON();
      const userMessage = [...payload.messages].reverse().find((m: any) => m.role === 'user');
      capturedContext = userMessage?.content || null;

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: 'data: {"delta":{"text":"{\\"pillText\\":\\"Truncated\\",\\"mode\\":\\"inline\\"}"}}\n\n'
          + 'data: [DONE]\n'
      });
    });

    await page.goto(DEMO_URL);
    await ensureExperienceReady(page);

    await page.evaluate(() => {
      const article = document.getElementById('article');
      if (!article) return;
      const filler = 'a'.repeat(250_000);
      article.innerText = `Gradient descent overview. ${filler}`;
    });

    await highlightGradientDescent(page);
    await triggerPalette(page);

    const palette = page.locator('.hx-palette');
    await expect(palette).toBeVisible();
    await palette.locator('#hx-toggle-truncation').click();
    await expect(palette.locator('#hx-toggle-truncation')).toHaveText(/disable truncation/i);
    await palette.locator('#hx-generate-button').click();

    await expect.poll(() => capturedContext, { message: 'context to be captured' }).not.toBeNull();

    const context = capturedContext!;
    expect(context).toContain('--- FULL PAGE TEXT ---');
    expect(context).toContain('[Context truncated at 200000 characters]');
    expect(context.length).toBeLessThanOrEqual(200500);
    expect(context).toContain('--- CURRENT SELECTION ---');
    expect(context).toMatch(/gradient descent/i);
  });
});
