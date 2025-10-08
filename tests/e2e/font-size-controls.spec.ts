/**
 * E2E tests for font size controls
 * Tests the FontSizeSelector component in both Canvas and Side Panel
 */

import { test, expect } from '../fixtures/extension';
import type { FontSize } from '@/types/settings';

test.describe('Font Size Controls', () => {
  test.describe('Canvas Font Size Selector', () => {
    test('should display font size selector in toolbar', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);
      await page.waitForLoadState('domcontentloaded');

      // Find font size selector
      const selector = await page.locator('[data-testid="font-size-selector"]');
      await expect(selector).toBeVisible();

      // Should have three buttons
      const smallBtn = await page.locator('[data-testid="font-size-small"]');
      const mediumBtn = await page.locator('[data-testid="font-size-medium"]');
      const largeBtn = await page.locator('[data-testid="font-size-large"]');

      await expect(smallBtn).toBeVisible();
      await expect(mediumBtn).toBeVisible();
      await expect(largeBtn).toBeVisible();

      await page.close();
    });

    test('should default to medium font size', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);
      await page.waitForLoadState('domcontentloaded');

      // Check that medium button has active state
      const mediumBtn = await page.locator('[data-testid="font-size-medium"]');
      await expect(mediumBtn).toHaveAttribute('data-active', 'true');

      await page.close();
    });

    test('should change active state when clicking different sizes', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);
      await page.waitForLoadState('domcontentloaded');

      const smallBtn = await page.locator('[data-testid="font-size-small"]');
      const mediumBtn = await page.locator('[data-testid="font-size-medium"]');
      const largeBtn = await page.locator('[data-testid="font-size-large"]');

      // Click small
      await smallBtn.click();
      await page.waitForTimeout(500); // Wait for state update

      // Verify small is active
      await expect(smallBtn).toHaveAttribute('data-active', 'true');

      // Click large
      await largeBtn.click();
      await page.waitForTimeout(500);

      // Verify large is active
      await expect(largeBtn).toHaveAttribute('data-active', 'true');

      await page.close();
    });

    test('should persist font size selection across page reloads', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);
      await page.waitForLoadState('domcontentloaded');

      // Select large font size
      const largeBtn = await page.locator('[data-testid="font-size-large"]');
      await largeBtn.click();
      await page.waitForTimeout(1000); // Wait for storage

      // Reload page
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Verify large is still selected
      const largeBtnAfterReload = await page.locator('[data-testid="font-size-large"]');
      await expect(largeBtnAfterReload).toHaveAttribute('data-active', 'true');

      await page.close();
    });
  });

  test.describe('Side Panel Font Size Selector', () => {
    test('should display font size selector in side panel header', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
      await page.waitForLoadState('domcontentloaded');

      // Find font size selector
      const selector = await page.locator('[data-testid="font-size-selector"]');
      await expect(selector).toBeVisible();

      await page.close();
    });

    test('should sync font size with canvas', async ({ context, extensionId }) => {
      // Open Canvas
      const canvasPage = await context.newPage();
      await canvasPage.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);
      await canvasPage.waitForLoadState('domcontentloaded');

      // Change to small in canvas
      const smallBtn = await canvasPage.locator('[data-testid="font-size-small"]');
      await smallBtn.click();
      await canvasPage.waitForTimeout(1000);

      // Open Side Panel
      const sidePanelPage = await context.newPage();
      await sidePanelPage.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
      await sidePanelPage.waitForLoadState('domcontentloaded');

      // Verify small is selected in side panel
      const sidePanelSmallBtn = await sidePanelPage.locator('[data-testid="font-size-small"]');
      await expect(sidePanelSmallBtn).toHaveAttribute('data-active', 'true');

      await canvasPage.close();
      await sidePanelPage.close();
    });
  });

  test.describe('Font Size Application', () => {
    test('should apply font size changes to card content', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);
      await page.waitForLoadState('domcontentloaded');

      // Create a test note
      await page.keyboard.press('Meta+N');
      await page.waitForTimeout(1000);

      // Get initial font size of card content
      const cardContent = await page.locator('.card-content-scrollable').first();
      const mediumFontSize = await cardContent.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });

      // Change to large
      const largeBtn = await page.locator('[data-testid="font-size-large"]');
      await largeBtn.click();
      await page.waitForTimeout(1000); // Wait for re-render

      // Get new font size
      const largeFontSize = await cardContent.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });

      // Verify font size increased
      const mediumPx = parseFloat(mediumFontSize);
      const largePx = parseFloat(largeFontSize);
      expect(largePx).toBeGreaterThan(mediumPx);

      // Change to small
      const smallBtn = await page.locator('[data-testid="font-size-small"]');
      await smallBtn.click();
      await page.waitForTimeout(1000);

      // Get small font size
      const smallFontSize = await cardContent.evaluate((el) => {
        return window.getComputedStyle(el).fontSize;
      });

      // Verify font size decreased
      const smallPx = parseFloat(smallFontSize);
      expect(smallPx).toBeLessThan(mediumPx);

      await page.close();
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper tooltips on font size buttons', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);
      await page.waitForLoadState('domcontentloaded');

      const smallBtn = await page.locator('[data-testid="font-size-small"]');
      const mediumBtn = await page.locator('[data-testid="font-size-medium"]');
      const largeBtn = await page.locator('[data-testid="font-size-large"]');

      const smallTitle = await smallBtn.getAttribute('title');
      const mediumTitle = await mediumBtn.getAttribute('title');
      const largeTitle = await largeBtn.getAttribute('title');

      expect(smallTitle).toContain('Small');
      expect(mediumTitle).toContain('Medium');
      expect(largeTitle).toContain('Large');

      await page.close();
    });

    test('should be keyboard accessible', async ({ context, extensionId }) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/canvas/index.html`);
      await page.waitForLoadState('domcontentloaded');

      // Tab to font size selector
      const smallBtn = await page.locator('[data-testid="font-size-small"]');

      // Focus and activate with keyboard
      await smallBtn.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);

      // Verify selection changed
      const smallActive = await smallBtn.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return !style.backgroundColor.includes('255, 255, 255');
      });
      expect(smallActive).toBe(true);

      await page.close();
    });
  });
});
