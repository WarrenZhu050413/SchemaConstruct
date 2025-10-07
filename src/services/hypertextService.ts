/**
 * Hypertext Service
 *
 * Adapter service that wraps the vanilla JS hypertext-experience module
 * and integrates it with NabokovsWeb's Card system.
 *
 * Key responsibilities:
 * - Initialize hypertext module on page load
 * - Convert hypertext sessions to Card format
 * - Save hypertext conversations to canvas/stash
 * - Handle persistence and state synchronization
 */

import type { Card, HypertextData } from '@/types/card';
import type { Message } from '@/types/chat';
import { generateId, saveCard } from '@/utils/storage';

// Type definitions for the hypertext module (vanilla JS)
interface HypertextSession {
  id: string;
  subject: string;
  context: string;
  wrapper: HTMLElement;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    display?: string | { explanation?: string; url?: string };
    timestamp: number;
  }>;
  lastResult: {
    pillText: string;
    mode: 'inline' | 'reference';
    explanation?: string;
    url?: string;
  } | null;
  tooltipPosition?: { left: number; top: number };
  tooltipSize?: { width: number; height: number };
  isPinned?: boolean;
  lastUpdatedAt: number;
}

interface HypertextExperience {
  applyHypertext: (instructions?: string) => void;
  destroy: () => void;
  getSessions: () => Map<string, HypertextSession>;
  getPaletteElement: () => HTMLElement;
  getTooltipElement: () => HTMLElement;
  triggerFromExternal: () => boolean;
}

declare global {
  interface Window {
    createHypertextExperience?: (options: {
      document?: Document;
      backendUrl?: string;
      contextProvider?: (session: any, options: any) => string;
      hotkey?: (event: KeyboardEvent) => boolean;
      selectionValidator?: (range: Range, text: string) => boolean;
      autoOpenTooltipOnHover?: boolean;
      registerExternalTrigger?: (fn: () => void) => void;
      chatPageUrl?: string;
    }) => HypertextExperience;
  }
}

/**
 * Hypertext Service Class
 */
export class HypertextService {
  private experience: HypertextExperience | null = null;
  private initialized = false;
  private saveCallbacks: Map<string, (destination: 'canvas' | 'stash') => void> = new Map();

  /**
   * Initialize hypertext module in the current document
   */
  init(document: Document): void {
    if (this.initialized) {
      console.log('[HypertextService] Already initialized');
      return;
    }

    // Check if hypertext module is loaded
    if (!window.createHypertextExperience) {
      console.error('[HypertextService] createHypertextExperience not found. Make sure hypertext-experience.js is loaded.');
      return;
    }

    try {
      this.experience = window.createHypertextExperience({
        document,
        backendUrl: 'http://localhost:3100',
        autoOpenTooltipOnHover: true,
        // Disable default hotkey (Cmd+Shift+K) - we'll use Ctrl+Shift+H from background worker
        hotkey: () => false,
        // Register external trigger for keyboard shortcut
        registerExternalTrigger: (fn: () => void) => {
          // Store trigger function to be called by message listener
          (window as any).__hypertextTrigger = fn;
        },
      });

      this.initialized = true;
      console.log('[HypertextService] Initialized successfully');

      // Set up periodic auto-save for hypertext sessions
      this.startAutoSave();
    } catch (error) {
      console.error('[HypertextService] Initialization failed:', error);
    }
  }

  /**
   * Trigger hypertext palette from external event (keyboard shortcut)
   */
  trigger(): boolean {
    if (!this.experience) {
      console.warn('[HypertextService] Not initialized');
      return false;
    }

    return this.experience.triggerFromExternal();
  }

  /**
   * Convert hypertext session to Card format
   */
  private sessionToCard(session: HypertextSession, destination: 'canvas' | 'stash' = 'canvas'): Card {
    // Convert messages to standard format
    const messages: Message[] = session.messages.map(msg => ({
      id: generateId(),
      role: msg.role,
      content: typeof msg.display === 'string'
        ? msg.display
        : msg.display?.explanation || msg.content,
      timestamp: msg.timestamp,
    }));

    // Build hypertext data
    const hypertextData: HypertextData = {
      sessionId: session.id,
      pillText: session.lastResult?.pillText || session.subject,
      mode: session.lastResult?.mode || 'inline',
      subject: session.subject,
      tooltipPosition: session.tooltipPosition ? {
        x: session.tooltipPosition.left,
        y: session.tooltipPosition.top
      } : undefined,
      tooltipSize: session.tooltipSize,
      isPinned: session.isPinned,
      url: session.lastResult?.url,
      pageUrl: window.location.href,
      pageTitle: document.title,
    };

    // Create card
    const card: Card = {
      id: generateId(),
      cardType: 'hypertext',
      content: this.formatHypertextHTML(session),
      conversation: messages,
      hypertextData,
      stashed: destination === 'stash',
      metadata: {
        url: window.location.href,
        title: `💡 ${session.lastResult?.pillText || session.subject}`,
        domain: window.location.hostname,
        favicon: '💡', // Hypertext icon
        timestamp: session.lastUpdatedAt || Date.now(),
        selectedText: session.subject,
      },
      position: undefined, // Will be auto-positioned on canvas
      size: { width: 380, height: 320 },
      starred: false,
      tags: ['hypertext', 'annotation'],
      createdAt: session.lastUpdatedAt || Date.now(),
      updatedAt: session.lastUpdatedAt || Date.now(),
    };

    return card;
  }

  /**
   * Format hypertext session as HTML card content
   */
  private formatHypertextHTML(session: HypertextSession): string {
    const pillText = session.lastResult?.pillText || session.subject;
    const mode = session.lastResult?.mode || 'inline';
    const explanation = session.lastResult?.explanation || '';
    const url = session.lastResult?.url || '';

    let html = `
      <div style="padding: 12px; background: rgba(177, 50, 50, 0.04); border-radius: 8px; margin-bottom: 12px;">
        <div style="font-size: 12px; color: #8B7355; margin-bottom: 6px;">
          <strong>Selected Text:</strong>
        </div>
        <div style="padding: 8px; background: white; border-radius: 6px; border: 1px solid rgba(177, 50, 50, 0.15);">
          "${session.subject}"
        </div>
      </div>
    `;

    if (mode === 'inline' && explanation) {
      html += `
        <div style="padding: 12px; background: white; border-radius: 8px; border: 1px solid rgba(177, 50, 50, 0.2);">
          <div style="font-size: 12px; color: #8B7355; margin-bottom: 8px; font-weight: 600;">
            💡 ${pillText}
          </div>
          <div style="color: #2c1f1f; line-height: 1.6; font-size: 13px;">
            ${explanation}
          </div>
        </div>
      `;
    }

    if (mode === 'reference' && url) {
      html += `
        <div style="padding: 12px; background: white; border-radius: 8px; border: 1px solid rgba(177, 50, 50, 0.2);">
          <div style="font-size: 12px; color: #8B7355; margin-bottom: 8px; font-weight: 600;">
            🔗 ${pillText}
          </div>
          ${explanation ? `<div style="color: #2c1f1f; line-height: 1.6; font-size: 13px; margin-bottom: 8px;">${explanation}</div>` : ''}
          <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #8B0000; text-decoration: underline; font-size: 13px;">
            ${url}
          </a>
        </div>
      `;
    }

    // Add conversation preview if there are follow-up messages
    if (session.messages.length > 2) {
      html += `
        <div style="margin-top: 16px; padding: 12px; background: rgba(255, 248, 220, 0.3); border-radius: 8px; border: 1px solid rgba(212, 175, 55, 0.3);">
          <div style="font-size: 11px; color: #8B7355; margin-bottom: 4px;">
            📝 ${session.messages.length - 1} conversation turn(s)
          </div>
          <div style="font-size: 12px; color: #5a4a3a;">
            Click to open chat window to see full conversation
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Save hypertext session as card
   */
  async saveSession(sessionId: string, destination: 'canvas' | 'stash' = 'canvas'): Promise<string | null> {
    if (!this.experience) {
      console.warn('[HypertextService] Not initialized');
      return null;
    }

    try {
      const sessions = this.experience.getSessions();
      const session = sessions.get(sessionId);

      if (!session) {
        console.error('[HypertextService] Session not found:', sessionId);
        return null;
      }

      // Convert to card
      const card = this.sessionToCard(session, destination);

      // Save to storage
      await saveCard(card);

      console.log('[HypertextService] Session saved as card:', card.id, 'destination:', destination);

      // Dispatch update events
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));
      if (destination === 'stash') {
        window.dispatchEvent(new CustomEvent('nabokov:stash-updated'));
      }

      return card.id;
    } catch (error) {
      console.error('[HypertextService] Failed to save session:', error);
      return null;
    }
  }

  /**
   * Save all active hypertext sessions
   */
  async saveAllSessions(destination: 'canvas' | 'stash' = 'canvas'): Promise<string[]> {
    if (!this.experience) {
      console.warn('[HypertextService] Not initialized');
      return [];
    }

    const sessions = this.experience.getSessions();
    const savedCardIds: string[] = [];

    for (const [sessionId, _session] of sessions) {
      const cardId = await this.saveSession(sessionId, destination);
      if (cardId) {
        savedCardIds.push(cardId);
      }
    }

    return savedCardIds;
  }

  /**
   * Start periodic auto-save of hypertext sessions
   * Saves sessions older than 5 minutes to canvas automatically
   */
  private startAutoSave(): void {
    // Auto-save every 2 minutes
    setInterval(() => {
      if (!this.experience) return;

      const sessions = this.experience.getSessions();
      const now = Date.now();
      const AUTO_SAVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

      for (const [sessionId, session] of sessions) {
        // Auto-save if session is old enough and has messages
        if (
          session.messages.length > 0 &&
          session.lastUpdatedAt &&
          now - session.lastUpdatedAt > AUTO_SAVE_THRESHOLD
        ) {
          console.log('[HypertextService] Auto-saving old session:', sessionId);
          this.saveSession(sessionId, 'canvas');
        }
      }
    }, 2 * 60 * 1000); // Check every 2 minutes
  }

  /**
   * Cleanup and destroy hypertext module
   */
  destroy(): void {
    if (this.experience) {
      this.experience.destroy();
      this.experience = null;
      this.initialized = false;
      console.log('[HypertextService] Destroyed');
    }
  }

  /**
   * Check if hypertext is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
export const hypertextService = new HypertextService();
