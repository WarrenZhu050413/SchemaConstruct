/**
 * Beautification service for AI-powered card content enhancement
 * Phase 2.1: AI Beautification
 */

import type { Card, BeautificationMode } from '@/types/card';
import { getCardById, saveCard } from '@/utils/storage';
import DOMPurify from 'dompurify';
import { claudeAPIService, type ClaudeMessage } from './claudeAPIService';
import { apiConfigService } from './apiConfig';

/**
 * Markdown-based prompt templates
 * These prompts instruct the LLM to return clean GitHub-flavored Markdown
 */
const PROMPT_TEMPLATES = {
  'organize-content': `
You are a content organization expert helping to structure information.

INPUT:
- Raw HTML content (possibly unstructured)

TASK:
Organize the content into clean, readable GitHub-flavored Markdown:
1. Extract key information
2. Create logical sections with headings (##, ###)
3. Use lists for enumerated items
4. Use tables for structured data
5. **Bold** important terms
6. Add clear visual hierarchy

CRITICAL RULES:
- Return ONLY GitHub-flavored Markdown (no HTML tags)
- Use ## for main sections, ### for subsections
- Use tables for any structured data or comparisons
- Use **bold** for emphasis, not <strong> tags
- Use - or * for bullet lists
- Use 1. 2. 3. for numbered lists
- Preserve all original information, just reorganize it
- NO code fences around the output - just raw markdown

Example format:
## Overview

This is the main content organized into clear sections.

### Key Points

| Feature | Description |
|---------|-------------|
| Point 1 | Details here |
| Point 2 | More details |

- Bullet point 1
- Bullet point 2

**Important:** Highlighted information stands out.

Return the beautified Markdown directly, with no explanations or code fences.
  `
};

/**
 * Beautification service interface
 */
export interface IBeautificationService {
  beautifyCard(cardId: string, mode: BeautificationMode): Promise<void>;
  revertBeautification(cardId: string): Promise<void>;
  isBeautified(card: Card): boolean;
}

/**
 * Beautification service implementation
 * Manages AI-powered content beautification
 */
export class BeautificationService implements IBeautificationService {
  /**
   * Beautify a card's content using AI
   * @param cardId Card ID to beautify
   * @param mode Beautification mode ('recreate-design' or 'organize-content')
   */
  async beautifyCard(cardId: string, mode: BeautificationMode): Promise<void> {
    try {
      console.log(`[BeautificationService] Starting beautification for card ${cardId} with mode: ${mode}`);

      const card = await getCardById(cardId);
      if (!card) {
        throw new Error(`Card not found: ${cardId}`);
      }

      // Don't beautify if already beautified
      if (card.beautifiedContent) {
        console.log('[BeautificationService] Card already beautified, reverting first');
        await this.revertBeautification(cardId);
        // Reload card after revert
        const reloadedCard = await getCardById(cardId);
        if (!reloadedCard) throw new Error(`Card not found after revert: ${cardId}`);
        Object.assign(card, reloadedCard);
      }

      // Save original content before beautification
      const originalHTML = card.content || '';

      // Generate beautified content using Claude API (returns Markdown)
      const beautifiedMarkdown = await this.generateBeautifiedContent(
        originalHTML,
        mode
      );

      // Note: No need to sanitize markdown - ReactMarkdown handles safety
      // The markdown is plain text, so it's inherently safe

      // Update card with beautified content (now markdown instead of HTML)
      const updatedCard: Card = {
        ...card,
        originalHTML,
        beautifiedContent: beautifiedMarkdown,
        beautificationMode: mode,
        beautificationTimestamp: Date.now(),
        updatedAt: Date.now(),
      };

      await saveCard(updatedCard);

      // Trigger refresh
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));

      console.log('[BeautificationService] Beautification complete');
    } catch (error) {
      console.error('[BeautificationService] Error beautifying card:', error);
      throw error;
    }
  }

  /**
   * Revert beautification and restore original content
   * @param cardId Card ID to revert
   */
  async revertBeautification(cardId: string): Promise<void> {
    try {
      console.log(`[BeautificationService] Reverting beautification for card ${cardId}`);

      const card = await getCardById(cardId);
      if (!card) {
        throw new Error(`Card not found: ${cardId}`);
      }

      if (!card.beautifiedContent) {
        console.log('[BeautificationService] Card is not beautified, nothing to revert');
        return;
      }

      // Restore original content
      const updatedCard: Card = {
        ...card,
        content: card.originalHTML || card.content,
        originalHTML: undefined,
        beautifiedContent: undefined,
        beautificationMode: undefined,
        beautificationTimestamp: undefined,
        updatedAt: Date.now(),
      };

      await saveCard(updatedCard);

      // Trigger refresh
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));

      console.log('[BeautificationService] Revert complete');
    } catch (error) {
      console.error('[BeautificationService] Error reverting beautification:', error);
      throw error;
    }
  }

  /**
   * Check if a card is beautified
   * @param card Card to check
   * @returns True if card has beautified content
   */
  isBeautified(card: Card): boolean {
    return !!card.beautifiedContent;
  }

  /**
   * Generate beautified content using AI (returns Markdown)
   * @param originalHTML Original HTML content
   * @param mode Beautification mode
   * @returns Beautified Markdown content
   * @private
   */
  private async generateBeautifiedContent(
    originalHTML: string,
    mode: BeautificationMode
  ): Promise<string> {
    console.log('[BeautificationService] Generating beautified markdown content...');
    console.log('[BeautificationService] Mode:', mode);

    // Use Claude API with text-only mode
    console.log('[BeautificationService] Trying Claude API...');

    try {
      const systemPrompt = PROMPT_TEMPLATES[mode];
      const userMessage = `Please beautify the following HTML content into clean GitHub-flavored Markdown:\n\n${originalHTML}`;

      const messages: ClaudeMessage[] = [
        { role: 'user', content: userMessage }
      ];

      const beautifiedMarkdown = await claudeAPIService.sendMessage(messages, {
        system: systemPrompt,
        maxTokens: 4096,
      });

      console.log('[BeautificationService] ✓ Claude API success');
      return beautifiedMarkdown;

    } catch (error) {
      // API FAILED - fall back to mock
      console.error('[BeautificationService] ✗ Claude API failed:', error);
      console.warn('[BeautificationService] Falling back to mock markdown response');
      await new Promise(resolve => setTimeout(resolve, 1500));
      return this.generateMockBeautifiedMarkdown(originalHTML, mode);
    }
  }

  private generateMockBeautifiedMarkdown(originalHTML: string, mode: BeautificationMode): string {
    const sanitizedHTML = DOMPurify.sanitize(originalHTML, {
      USE_PROFILES: { html: true },
    });

    let plainText = sanitizedHTML;
    if (typeof window !== 'undefined') {
      const parser = window.document.createElement('div');
      parser.innerHTML = sanitizedHTML;
      plainText = parser.textContent || parser.innerText || '';
    } else {
      plainText = sanitizedHTML.replace(/<[^>]+>/g, ' ');
    }

    const normalizedText = plainText
      .replace(/\s+/g, ' ')
      .trim();

    let bulletLines = normalizedText
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(Boolean);

    if (bulletLines.length === 0 && normalizedText) {
      bulletLines = [normalizedText];
    }

    if (bulletLines.length === 1 && bulletLines[0].length > 200) {
      const tokens = bulletLines[0].split(/\s+/).filter(Boolean);
      const chunkSize = 25;
      const maxChunks = 6;
      const chunks: string[] = [];

      for (let i = 0; i < tokens.length && chunks.length < maxChunks; i += chunkSize) {
        const slice = tokens.slice(i, i + chunkSize).join(' ');
        const isTruncated = i + chunkSize < tokens.length;
        chunks.push(`${slice}${isTruncated ? ' …' : ''}`);
      }

      bulletLines = chunks;
    }

    if (bulletLines.length > 6) {
      bulletLines = bulletLines.slice(0, 6);
    }

    if (bulletLines.length === 0) {
      bulletLines = ['Original content was empty or could not be parsed.'];
    }

    const bulletList = bulletLines.map(line => `- ${line}`).join('\n');

    const characterCount = normalizedText.length;

    let markdown = `## Organized Summary\n\n${bulletList}\n\n### Key Details\n- Beautification mode: ${mode.replace(/-/g, ' ')}\n- Original length: ${characterCount} characters\n- Generated in mock-safe mode\n`;

    const MAX_LENGTH = 4000;
    if (markdown.length > MAX_LENGTH) {
      markdown = `${markdown.slice(0, MAX_LENGTH)}…`;
    }

    console.log('[BeautificationService] Mock markdown generated', {
      mode,
      length: markdown.length,
    });

    return markdown;
  }
}

// Singleton instance
export const beautificationService = new BeautificationService();
