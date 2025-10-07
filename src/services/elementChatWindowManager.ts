/**
 * Element Chat Window Manager
 *
 * Manages multiple floating chat windows attached to page elements.
 * Handles window positioning, state persistence, and lifecycle.
 */

import type { ChatWindowState } from '@/types/elementChat';
import type { ElementDescriptor } from './elementIdService';

/**
 * Window info for an active element chat
 */
export interface ActiveChatWindow {
  /** Element's chat ID */
  elementId: string;
  /** Element descriptor for positioning */
  elementDescriptor: ElementDescriptor;
  /** Current window state */
  windowState: ChatWindowState;
  /** Page URL */
  pageUrl: string;
  /** Window creation timestamp */
  createdAt: number;
}

type WindowListener = () => void;

/**
 * ElementChatWindowManager - Singleton service
 */
class ElementChatWindowManager {
  private windows: Map<string, ActiveChatWindow> = new Map();
  private listeners: Set<WindowListener> = new Set();

  /**
   * Get default position for a new chat window near an element
   */
  getDefaultPosition(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();

    // Try to position window to the right of element
    let x = rect.right + window.scrollX + 20;
    let y = rect.top + window.scrollY;

    // If too far right, position to left instead
    if (x + 420 > window.innerWidth + window.scrollX) {
      x = Math.max(20, rect.left + window.scrollX - 420 - 20);
    }

    // Keep within vertical bounds
    if (y + 550 > window.innerHeight + window.scrollY) {
      y = Math.max(20, window.innerHeight + window.scrollY - 550 - 20);
    }

    return { x, y };
  }

  /**
   * Get default size for chat window
   */
  getDefaultSize(): { width: number; height: number } {
    return {
      width: 420,
      height: 550
    };
  }

  /**
   * Open a chat window for an element
   * Returns existing window if already open
   */
  openWindow(
    elementId: string,
    element: HTMLElement,
    elementDescriptor: ElementDescriptor,
    existingWindowState?: ChatWindowState
  ): ActiveChatWindow {
    // Check if window already exists
    const existing = this.windows.get(elementId);
    if (existing) {
      console.log('[ElementChatWindowManager] Window already open for element:', elementId);
      return existing;
    }

    // Create window state
    const windowState: ChatWindowState = existingWindowState || {
      position: this.getDefaultPosition(element),
      size: this.getDefaultSize(),
      collapseState: 'expanded',
      collapsed: false
    };

    const chatWindow: ActiveChatWindow = {
      elementId,
      elementDescriptor,
      windowState,
      pageUrl: window.location.href,
      createdAt: Date.now()
    };

    this.windows.set(elementId, chatWindow);
    console.log('[ElementChatWindowManager] Opened window for element:', elementId);
    this.notifyListeners();

    return chatWindow;
  }

  /**
   * Close a chat window
   */
  closeWindow(elementId: string): void {
    const chatWindow = this.windows.get(elementId);
    if (chatWindow) {
      this.windows.delete(elementId);
      console.log('[ElementChatWindowManager] Closed window for element:', elementId);
      this.notifyListeners();
    }
  }

  /**
   * Get a specific window
   */
  getWindow(elementId: string): ActiveChatWindow | undefined {
    return this.windows.get(elementId);
  }

  /**
   * Get all open windows
   */
  getAllWindows(): ActiveChatWindow[] {
    return Array.from(this.windows.values());
  }

  /**
   * Update window position
   */
  updatePosition(elementId: string, x: number, y: number): void {
    const chatWindow = this.windows.get(elementId);
    if (chatWindow) {
      chatWindow.windowState.position = { x, y };
      this.notifyListeners();
    }
  }

  /**
   * Update window size
   */
  updateSize(elementId: string, width: number, height: number): void {
    const chatWindow = this.windows.get(elementId);
    if (chatWindow) {
      chatWindow.windowState.size = { width, height };
      this.notifyListeners();
    }
  }

  /**
   * Toggle window collapsed state
   */
  toggleCollapse(elementId: string): void {
    const chatWindow = this.windows.get(elementId);
    if (chatWindow) {
      const nextState = chatWindow.windowState.collapseState === 'expanded' ? 'rectangle' : 'expanded';
      chatWindow.windowState.collapseState = nextState;
      chatWindow.windowState.collapsed = nextState !== 'expanded';
      console.log('[ElementChatWindowManager] Toggled collapse:', elementId, chatWindow.windowState.collapseState);
      this.notifyListeners();
    }
  }

  /**
   * Check if a window is open
   */
  isWindowOpen(elementId: string): boolean {
    return this.windows.has(elementId);
  }

  /**
   * Get count of open windows
   */
  getWindowCount(): number {
    return this.windows.size;
  }

  /**
   * Close all windows
   */
  closeAll(): void {
    this.windows.clear();
    console.log('[ElementChatWindowManager] Closed all windows');
    this.notifyListeners();
  }

  /**
   * Subscribe to window changes
   */
  subscribe(listener: WindowListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('[ElementChatWindowManager] Listener error:', error);
      }
    });
  }
}

// Export singleton instance
export const elementChatWindowManager = new ElementChatWindowManager();
