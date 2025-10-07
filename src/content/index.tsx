/**
 * Content Script for Nabokov Web Clipper
 *
 * Entry point for the Chrome extension content script that integrates
 * ElementSelector and FloatingChat components into web pages via Shadow DOM.
 *
 * Flow:
 * 1. Background script sends ACTIVATE_SELECTOR message (triggered by Cmd+Shift+E)
 * 2. Content script mounts ElementSelector in Shadow DOM
 * 3. User selects an element
 * 4. ElementSelector captures element data
 * 5. FloatingChat appears for conversation
 * 6. Data saved to chrome.storage.local and IndexedDB
 * 7. User closes chat or presses ESC to deactivate
 */

import React from 'react';
import { createShadowRoot, mountReactInShadow, CHINESE_AESTHETIC_STYLES } from '../utils/shadowDOM';
import { ElementSelector } from '../components/ElementSelector';
import { FloatingChat } from '../components/FloatingChat';
import { InlineChatWindow } from '../components/InlineChatWindow';
import { ElementChatWindow } from '../components/ElementChatWindow';
import { initElementChatIndicators, syncIndicatorsForSessions, teardownElementChatIndicators } from '@/services/elementChatIndicatorService';
import { getAllElementChats } from '@/services/elementChatService';
import { capturePageContext } from '../services/pageContextCapture';
import { captureElementContext } from '../services/elementContextCapture';
import { Card } from '../types';
import { saveCard, generateId } from '../utils/storage';
import type { ElementDescriptor } from '@/services/elementIdService';
import { hypertextService } from '@/services/hypertextService';

// ============================================================================
// State Management
// ============================================================================

/**
 * Content script state
 */
interface ContentScriptState {
  /** Whether element selector is currently active */
  isActive: boolean;
  /** Currently selected element (if any) */
  selectedElement: HTMLElement | null;
  /** Captured card data */
  capturedCard: Card | null;
  /** Whether floating chat is visible */
  showFloatingChat: boolean;
  /** Shadow root container element */
  containerElement: HTMLElement | null;
  /** Cleanup function for React unmounting */
  cleanup: (() => void) | null;
}

/**
 * Global state for content script
 */
let state: ContentScriptState = {
  isActive: false,
  selectedElement: null,
  capturedCard: null,
  showFloatingChat: false,
  containerElement: null,
  cleanup: null,
};

/**
 * Inline chat state (separate from element selector)
 */
interface InlineChatState {
  isOpen: boolean;
  containerElement: HTMLElement | null;
  cleanup: (() => void) | null;
}

let inlineChatState: InlineChatState = {
  isOpen: false,
  containerElement: null,
  cleanup: null,
};

/**
 * Last right-clicked element (for context menu)
 */
let lastRightClickedElement: HTMLElement | null = null;
let lastRightClickPosition: { x: number; y: number } = { x: 0, y: 0 };

/**
 * Element chat windows state (for element-attached persistent chats)
 */
interface ElementChatWindowState {
  elementId: string;
  containerElement: HTMLElement;
  cleanup: () => void;
}

/**
 * Track all active element chat windows
 */
let elementChatWindows: Map<string, ElementChatWindowState> = new Map();

/**
 * Container for chat selector (separate from element selector)
 */
let chatSelectorState: {
  isActive: boolean;
  containerElement: HTMLElement | null;
  cleanup: (() => void) | null;
} = {
  isActive: false,
  containerElement: null,
  cleanup: null
};

// ============================================================================
// Shadow DOM Setup
// ============================================================================

/**
 * Creates and mounts the shadow DOM container
 *
 * @returns The container element with shadow root attached
 */
function createContainer(): HTMLElement {
  // Create container element
  const container = document.createElement('div');
  container.id = 'nabokov-clipper-root';
  container.setAttribute('data-nabokov-container', 'true');

  // Position absolutely to avoid interfering with page layout
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483647;
    pointer-events: none;
  `;

  // Append to body
  document.body.appendChild(container);

  console.log('[content] Container created and mounted');
  return container;
}

/**
 * Removes the container element from the DOM
 *
 * @param container - The container element to remove
 */
function removeContainer(container: HTMLElement): void {
  if (container.parentNode) {
    container.parentNode.removeChild(container);
    console.log('[content] Container removed');
  }
}

// ============================================================================
// Component Integration
// ============================================================================

/**
 * Activates the element selector by mounting it in Shadow DOM
 */
function activateSelector(initialStashState: boolean = false): void {
  // Prevent multiple activations
  if (state.isActive) {
    console.warn('[content] Selector already active');
    return;
  }

  console.log('[content] Activating element selector...', {
    initialStashState,
    stashModeEnabled: initialStashState,
    timestamp: Date.now()
  });

  try {
    // Create container
    const container = createContainer();
    state.containerElement = container;

    // Create shadow root with Chinese aesthetic styles
    const { shadowRoot, styleCache } = createShadowRoot(container, {
      injectBaseStyles: true,
    });

    // Handle element capture
    const handleCapture = (card: Card) => {
      console.log('[content] Element captured:', card.id);

      // Update state
      state.capturedCard = card;
      state.showFloatingChat = true;

      // Remount with FloatingChat visible
      if (state.selectedElement) {
        remountWithChat(shadowRoot, styleCache);
      }
    };

    // Handle selector close
    const handleClose = () => {
      console.log('[content] Selector closed');
      deactivateSelector();
    };

    // Mount ElementSelector with initial stash state
    const cleanup = mountReactInShadow(
      shadowRoot,
      <ElementSelector
        onCapture={handleCapture}
        onClose={handleClose}
        initialStashState={initialStashState}
      />,
      { styleCache }
    );

    // Update state
    state.isActive = true;
    state.cleanup = cleanup;

    console.log('[content] Element selector activated successfully');

  } catch (error) {
    console.error('[content] Error activating selector:', error);

    // Cleanup on error
    if (state.containerElement) {
      removeContainer(state.containerElement);
      state.containerElement = null;
    }

    // Send error message to background
    chrome.runtime.sendMessage({
      type: 'SELECTOR_ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

/**
 * Remounts the component tree with FloatingChat visible
 *
 * This is called after an element is captured to show the chat interface.
 *
 * @param shadowRoot - The shadow root to mount into
 * @param styleCache - The Emotion style cache
 */
function remountWithChat(shadowRoot: ShadowRoot, styleCache: any): void {
  // Unmount current component
  if (state.cleanup) {
    state.cleanup();
    state.cleanup = null;
  }

  // Handle chat close
  const handleChatClose = () => {
    console.log('[content] Chat closed');
    deactivateSelector();
  };

  // Mount ElementSelector with FloatingChat
  // Note: ElementSelector internally handles showing FloatingChat when
  // showFloatingChat state is true, so we just need to remount it
  // Actually, looking at ElementSelector, it already handles this internally
  // So we don't need to remount - it will show the chat automatically
  // This function is kept for future extensibility

  console.log('[content] Chat mounted');
}

/**
 * Deactivates the element selector and cleans up
 */
function deactivateSelector(): void {
  if (!state.isActive) {
    console.warn('[content] Selector not active');
    return;
  }

  console.log('[content] Deactivating element selector...');

  try {
    // Unmount React components
    if (state.cleanup) {
      state.cleanup();
      state.cleanup = null;
    }

    // Remove container
    if (state.containerElement) {
      removeContainer(state.containerElement);
      state.containerElement = null;
    }

    // Reset state
    state = {
      isActive: false,
      selectedElement: null,
      capturedCard: null,
      showFloatingChat: false,
      containerElement: null,
      cleanup: null,
    };

    console.log('[content] Element selector deactivated successfully');

  } catch (error) {
    console.error('[content] Error deactivating selector:', error);

    // Force cleanup
    state = {
      isActive: false,
      selectedElement: null,
      capturedCard: null,
      showFloatingChat: false,
      containerElement: null,
      cleanup: null,
    };
  }
}

// ============================================================================
// Inline Chat Functions
// ============================================================================

/**
 * Opens the inline chat window
 */
function openInlineChat(): void {
  // Toggle if already open
  if (inlineChatState.isOpen) {
    console.log('[content] Inline chat already open, toggling closed');
    closeInlineChat();
    return;
  }

  console.log('[content] Opening inline chat...');

  try {
    // Capture page context
    const pageContext = capturePageContext();
    console.log('[content] Page context captured:', pageContext.title);

    // Create container
    const container = document.createElement('div');
    container.id = 'nabokov-inline-chat-root';
    container.setAttribute('data-nabokov-chat', 'true');

    // Position for fixed elements (inline chat uses its own positioning)
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483646;
      pointer-events: none;
    `;

    document.body.appendChild(container);
    inlineChatState.containerElement = container;

    // Create shadow root
    const { shadowRoot, styleCache } = createShadowRoot(container, {
      injectBaseStyles: true,
    });

    // Handle save to canvas
    const handleSaveToCanvas = async (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
      console.log('[content] Saving conversation to canvas...');

      try {
        // Format conversation as HTML
        const conversationHTML = messages.map((msg, i) => {
          const role = msg.role === 'user' ? 'You' : 'Assistant';
          return `<div style="margin: 12px 0;">
            <strong style="color: ${msg.role === 'user' ? '#8B0000' : '#FFD700'};">${role}:</strong>
            <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${msg.content}</p>
          </div>`;
        }).join('\n');

        const card: Card = {
          id: generateId(),
          content: `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
            <h3 style="color: #8B0000; margin-bottom: 12px;">💬 Chat with ${pageContext.title}</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 16px;">
              <strong>URL:</strong> ${pageContext.url}
            </p>
            ${conversationHTML}
          </div>`,
          metadata: {
            url: pageContext.url,
            title: `Chat: ${pageContext.title}`,
            domain: new URL(pageContext.url).hostname,
            clipDate: new Date().toISOString(),
            favicon: '',
          },
          starred: false,
          tags: ['chat', 'conversation'],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cardType: 'note',
        };

        await saveCard(card);
        console.log('[content] Conversation saved to canvas:', card.id);

        // Dispatch event to notify canvas
        window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));

        // Show success message (if you have a toast system)
        alert('Conversation saved to canvas!');
      } catch (error) {
        console.error('[content] Error saving conversation:', error);
        alert('Error saving conversation. Please try again.');
      }
    };

    // Handle close
    const handleClose = () => {
      console.log('[content] Inline chat closed');
      closeInlineChat();
    };

    // Mount InlineChatWindow
    const cleanup = mountReactInShadow(
      shadowRoot,
      <InlineChatWindow
        onClose={handleClose}
        initialContext={pageContext}
        onSaveToCanvas={handleSaveToCanvas}
      />,
      { styleCache }
    );

    // Update state
    inlineChatState.isOpen = true;
    inlineChatState.cleanup = cleanup;

    console.log('[content] Inline chat opened successfully');

  } catch (error) {
    console.error('[content] Error opening inline chat:', error);

    // Cleanup on error
    if (inlineChatState.containerElement) {
      if (inlineChatState.containerElement.parentNode) {
        inlineChatState.containerElement.parentNode.removeChild(inlineChatState.containerElement);
      }
      inlineChatState.containerElement = null;
    }
  }
}

/**
 * Closes the inline chat window
 */
function closeInlineChat(): void {
  if (!inlineChatState.isOpen) {
    console.warn('[content] Inline chat not open');
    return;
  }

  console.log('[content] Closing inline chat...');

  try {
    // Unmount React component
    if (inlineChatState.cleanup) {
      inlineChatState.cleanup();
      inlineChatState.cleanup = null;
    }

    // Remove container
    if (inlineChatState.containerElement && inlineChatState.containerElement.parentNode) {
      inlineChatState.containerElement.parentNode.removeChild(inlineChatState.containerElement);
      inlineChatState.containerElement = null;
    }

    // Reset state
    inlineChatState = {
      isOpen: false,
      containerElement: null,
      cleanup: null,
    };

    console.log('[content] Inline chat closed successfully');

  } catch (error) {
    console.error('[content] Error closing inline chat:', error);

    // Force cleanup
    inlineChatState = {
      isOpen: false,
      containerElement: null,
      cleanup: null,
    };
  }
}

/**
 * Opens element-contextual chat for the last right-clicked element
 */
function openElementChat(): void {
  if (!lastRightClickedElement) {
    console.warn('[content] No element selected for chat');
    return;
  }

  // Close existing chat if open
  if (inlineChatState.isOpen) {
    closeInlineChat();
  }

  console.log('[content] Opening element chat...', lastRightClickedElement);

  try {
    // Capture element context
    const elementContext = captureElementContext(lastRightClickedElement);
    console.log('[content] Element context captured:', elementContext.element.tagName);

    // Create container
    const container = document.createElement('div');
    container.id = 'nabokov-element-chat-root';
    container.setAttribute('data-nabokov-element-chat', 'true');

    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483646;
      pointer-events: none;
    `;

    document.body.appendChild(container);
    inlineChatState.containerElement = container;

    // Create shadow root
    const { shadowRoot, styleCache } = createShadowRoot(container, {
      injectBaseStyles: true,
    });

    // Add visual highlight to target element
    const originalOutline = lastRightClickedElement.style.outline;
    const originalOutlineOffset = lastRightClickedElement.style.outlineOffset;
    lastRightClickedElement.style.outline = '2px solid #8B0000';
    lastRightClickedElement.style.outlineOffset = '2px';

    // Handle save to canvas
    const handleSaveToCanvas = async (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
      console.log('[content] Saving element conversation to canvas...');

      try {
        const conversationHTML = messages.map((msg, i) => {
          const role = msg.role === 'user' ? 'You' : 'Assistant';
          return `<div style="margin: 12px 0;">
            <strong style="color: ${msg.role === 'user' ? '#8B0000' : '#FFD700'};">${role}:</strong>
            <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${msg.content}</p>
          </div>`;
        }).join('\n');

        const card: Card = {
          id: generateId(),
          content: `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
            <h3 style="color: #8B0000; margin-bottom: 12px;">🎯 Chat about ${elementContext.element.tagName}</h3>
            <p style="font-size: 12px; color: #666; margin-bottom: 8px;">
              <strong>Element:</strong> &lt;${elementContext.element.tagName}&gt;${elementContext.element.id ? `#${elementContext.element.id}` : ''}
            </p>
            <p style="font-size: 12px; color: #666; margin-bottom: 16px;">
              <strong>URL:</strong> ${elementContext.url}
            </p>
            ${conversationHTML}
          </div>`,
          metadata: {
            url: elementContext.url,
            title: `Chat: <${elementContext.element.tagName}>`,
            domain: new URL(elementContext.url).hostname,
            clipDate: new Date().toISOString(),
            favicon: '',
          },
          starred: false,
          tags: ['chat', 'element', elementContext.element.tagName],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cardType: 'note',
        };

        await saveCard(card);
        console.log('[content] Element conversation saved to canvas:', card.id);

        window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));
        alert('Conversation saved to canvas!');
      } catch (error) {
        console.error('[content] Error saving conversation:', error);
        alert('Error saving conversation. Please try again.');
      }
    };

    // Handle close
    const handleClose = () => {
      console.log('[content] Element chat closed');

      // Restore original outline
      if (lastRightClickedElement) {
        lastRightClickedElement.style.outline = originalOutline;
        lastRightClickedElement.style.outlineOffset = originalOutlineOffset;
      }

      closeInlineChat();
    };

    // Mount InlineChatWindow with element context
    const cleanup = mountReactInShadow(
      shadowRoot,
      <InlineChatWindow
        onClose={handleClose}
        initialContext={elementContext}
        elementPosition={lastRightClickPosition}
        onSaveToCanvas={handleSaveToCanvas}
        anchorElements={[lastRightClickedElement]}
      />,
      { styleCache }
    );

    inlineChatState.isOpen = true;
    inlineChatState.cleanup = cleanup;

    console.log('[content] Element chat opened successfully');

  } catch (error) {
    console.error('[content] Error opening element chat:', error);

    if (inlineChatState.containerElement) {
      if (inlineChatState.containerElement.parentNode) {
        inlineChatState.containerElement.parentNode.removeChild(inlineChatState.containerElement);
      }
      inlineChatState.containerElement = null;
    }
  }
}

// ============================================================================
// Element-Attached Chat Functions
// ============================================================================

/**
 * Activates the element selector in chat mode
 * If text is selected, opens text-contextual chat instead
 */
function activateChatSelector(): void {
  // Prevent multiple activations
  if (chatSelectorState.isActive) {
    console.warn('[content] Chat selector already active');
    return;
  }

  console.log('[content] Activating chat selector...');

  // Check for text selection
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || '';

  if (selectedText && selectedText.length > 0) {
    console.log('[content] Text selected, opening text-contextual chat:', selectedText.substring(0, 50) + '...');
    openTextContextChat(selectedText, selection);
    return;
  }

  try {
    // Create container
    const container = createContainer();
    chatSelectorState.containerElement = container;

    // Create shadow root
    const { shadowRoot, styleCache } = createShadowRoot(container, {
      injectBaseStyles: true,
    });

    // Handle element selection for chat
    const handleChatSelect = async (payload: {
      elements: HTMLElement[];
      descriptors: ElementDescriptor[];
      chatId: string;
      existingChatIds: Array<string | null>;
    }) => {
      console.log('[content] Elements selected for chat:', {
        chatId: payload.chatId,
        elementCount: payload.elements.length,
        existingChatIds: payload.existingChatIds.filter(id => id !== null),
      });

      // Close the selector
      deactivateChatSelector();

      // Open chat window for these elements
      await openElementChatWindow(payload.elements, payload.descriptors, payload.chatId);
    };

    // Handle selector close
    const handleClose = () => {
      console.log('[content] Chat selector closed');
      deactivateChatSelector();
    };

    // Mount ElementSelector in chat mode
    const cleanup = mountReactInShadow(
      shadowRoot,
      <ElementSelector
        mode="chat"
        onChatSelect={handleChatSelect}
        onClose={handleClose}
      />,
      { styleCache }
    );

    chatSelectorState.isActive = true;
    chatSelectorState.cleanup = cleanup;

    console.log('[content] Chat selector activated successfully');

  } catch (error) {
    console.error('[content] Error activating chat selector:', error);

    // Cleanup on error
    if (chatSelectorState.containerElement) {
      removeContainer(chatSelectorState.containerElement);
      chatSelectorState.containerElement = null;
    }
  }
}

/**
 * Deactivates the chat selector
 */
function deactivateChatSelector(): void {
  if (!chatSelectorState.isActive) {
    return;
  }

  console.log('[content] Deactivating chat selector...');

  try {
    // Unmount React component
    if (chatSelectorState.cleanup) {
      chatSelectorState.cleanup();
      chatSelectorState.cleanup = null;
    }

    // Remove container
    if (chatSelectorState.containerElement) {
      removeContainer(chatSelectorState.containerElement);
      chatSelectorState.containerElement = null;
    }

    chatSelectorState.isActive = false;

    console.log('[content] Chat selector deactivated');

  } catch (error) {
    console.error('[content] Error deactivating chat selector:', error);

    // Force cleanup
    chatSelectorState = {
      isActive: false,
      containerElement: null,
      cleanup: null
    };
  }
}

/**
 * Opens an element chat window
 */
async function openElementChatWindow(
  elements: HTMLElement[],
  descriptors: ElementDescriptor[],
  chatId: string
): Promise<void> {
  try {
    if (!elements || elements.length === 0) {
      console.warn('[content] No elements provided for chat window');
      return;
    }

    const uniqueElements = Array.from(new Set(elements));

    const { setElementChatId, generateElementDescriptor } = await import('@/services/elementIdService');
    const { loadElementChat } = await import('@/services/elementChatService');

    // Ensure all elements share the chat ID attribute
    uniqueElements.forEach(el => setElementChatId(el, chatId));

    let descriptorList = descriptors;
    if (!descriptorList || descriptorList.length === 0) {
      descriptorList = uniqueElements.map(el => generateElementDescriptor(el));
    }

    const primaryDescriptor = descriptorList[0];
    const primaryElement = uniqueElements[0];

    if (!primaryDescriptor || !primaryElement) {
      console.error('[content] Unable to resolve primary descriptor/element for chat window');
      return;
    }

    // Avoid opening duplicate windows
    if (elementChatWindows.has(chatId)) {
      console.log('[content] Chat window already open for chatId:', chatId);
      return;
    }

    // Load existing session if available
    const existingSession = await loadElementChat(chatId, window.location.href);

    // Merge descriptors with any stored in session
    let mergedDescriptors = descriptorList;
    if (existingSession?.elementDescriptors && existingSession.elementDescriptors.length > 0) {
      const descriptorMap = new Map<string, ElementDescriptor>();
      existingSession.elementDescriptors.forEach(descriptor => {
        descriptorMap.set(descriptor.chatId, descriptor);
      });
      descriptorList.forEach(descriptor => {
        descriptorMap.set(descriptor.chatId, descriptor);
      });
      mergedDescriptors = Array.from(descriptorMap.values());
    }

    console.log('[content] Opening chat window:', {
      chatId,
      anchorCount: mergedDescriptors.length,
      hasExistingSession: existingSession !== null,
      messageCount: existingSession?.messages.length || 0
    });

    // Create container for chat window
    const container = document.createElement('div');
    container.id = `nabokov-element-chat-${chatId}`;
    container.setAttribute('data-nabokov-element-chat', chatId);

    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483645;
      pointer-events: none;
    `;

    document.body.appendChild(container);

    // Create shadow root
    const { shadowRoot, styleCache } = createShadowRoot(container, {
      injectBaseStyles: true,
    });

    // Calculate initial position near the primary element
    const rect = primaryElement.getBoundingClientRect();
    const initialPosition = {
      x: Math.min(rect.right + 20, window.innerWidth - 450),
      y: Math.max(20, rect.top)
    };

    // Handle close
    const handleClose = () => {
      console.log('[content] Element chat window closed:', chatId);
      closeElementChatWindow(chatId);
    };

    // Mount ElementChatWindow
    const cleanup = mountReactInShadow(
      shadowRoot,
      <ElementChatWindow
        elementId={chatId}
        elementDescriptors={mergedDescriptors}
        existingSession={existingSession}
        onClose={handleClose}
        initialPosition={initialPosition}
      />,
      { styleCache }
    );

    // Track window
    elementChatWindows.set(chatId, {
      elementId: chatId,
      containerElement: container,
      cleanup
    });

    console.log('[content] Element chat window opened successfully:', chatId);

  } catch (error) {
    console.error('[content] Error opening element chat window:', error);
  }
}

/**
 * Closes an element chat window
 */
function closeElementChatWindow(elementId: string): void {
  const windowState = elementChatWindows.get(elementId);
  if (!windowState) {
    console.warn('[content] No chat window found for element:', elementId);
    return;
  }

  console.log('[content] Closing element chat window:', elementId);

  try {
    // Unmount React component
    if (windowState.cleanup) {
      windowState.cleanup();
    }

    // Remove container
    if (windowState.containerElement && windowState.containerElement.parentNode) {
      windowState.containerElement.parentNode.removeChild(windowState.containerElement);
    }

    // Remove from tracking
    elementChatWindows.delete(elementId);

    console.log('[content] Element chat window closed successfully:', elementId);

  } catch (error) {
    console.error('[content] Error closing element chat window:', error);

    // Force removal
    elementChatWindows.delete(elementId);
  }
}

/**
 * Opens a text-contextual chat window for selected text
 */
async function openTextContextChat(selectedText: string, selection: Selection | null): Promise<void> {
  try {
    console.log('[content] Opening text-contextual chat for:', selectedText.substring(0, 50) + '...');

    // Import services
    const { generateElementDescriptor } = await import('@/services/elementIdService');

    // Get the anchor element for positioning
    const anchorElement = selection?.anchorNode?.parentElement || document.body;

    // Generate a unique chat ID for this text selection
    const textHash = selectedText.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    const elementId = `text-selection-${Math.abs(textHash).toString(36)}-${Date.now()}`;

    // Check if window already open for this selection
    if (elementChatWindows.has(elementId)) {
      console.log('[content] Chat window already open for this text selection');
      return;
    }

    // Create synthetic element descriptor for text selection
    const elementDescriptor = generateElementDescriptor(anchorElement);
    // Override with text-specific data
    elementDescriptor.tagName = 'text-selection';
    elementDescriptor.textPreview = selectedText;

    // Create container for chat window
    const container = document.createElement('div');
    container.id = `nabokov-element-chat-${elementId}`;
    container.setAttribute('data-nabokov-element-chat', elementId);
    container.setAttribute('data-text-selection', 'true');

    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483645;
      pointer-events: none;
    `;

    document.body.appendChild(container);

    // Create shadow root
    const { shadowRoot, styleCache } = createShadowRoot(container, {
      injectBaseStyles: true,
    });

    // Calculate initial position near the selection
    const range = selection?.getRangeAt(0);
    const selectionRect = range?.getBoundingClientRect() || anchorElement.getBoundingClientRect();
    const initialPosition = {
      x: Math.min(selectionRect.right + 20, window.innerWidth - 450),
      y: Math.max(20, selectionRect.top)
    };

    // Handle close
    const handleClose = () => {
      console.log('[content] Text-contextual chat window closed:', elementId);
      closeElementChatWindow(elementId);
    };

    // Mount ElementChatWindow with selectedText prop
    const cleanup = mountReactInShadow(
      shadowRoot,
      <ElementChatWindow
        elementId={elementId}
        elementDescriptors={[elementDescriptor]}
        existingSession={null}
        onClose={handleClose}
        initialPosition={initialPosition}
        selectedText={selectedText}
      />,
      { styleCache }
    );

    // Track window
    elementChatWindows.set(elementId, {
      elementId,
      containerElement: container,
      cleanup
    });

    console.log('[content] Text-contextual chat window opened successfully:', elementId);

  } catch (error) {
    console.error('[content] Error opening text-contextual chat window:', error);
  }
}

/**
 * Closes all element chat windows
 */
function closeAllElementChatWindows(): void {
  console.log('[content] Closing all element chat windows...');

  const elementIds = Array.from(elementChatWindows.keys());
  elementIds.forEach(closeElementChatWindow);

  console.log('[content] All element chat windows closed');
}

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Message types for extension communication
 */
type MessageType =
  | 'ACTIVATE_SELECTOR'
  | 'DEACTIVATE_SELECTOR'
  | 'ACTIVATE_CHAT_SELECTOR'
  | 'GET_STATE'
  | 'PING'
  | 'OPEN_INLINE_CHAT'
  | 'CLOSE_INLINE_CHAT'
  | 'OPEN_ELEMENT_CHAT'
  | 'TRIGGER_HYPERTEXT';

/**
 * Message structure
 */
interface Message {
  type: MessageType;
  payload?: any;
}

/**
 * Handles messages from background script
 *
 * @param message - The message object
 * @param sender - Message sender info
 * @param sendResponse - Function to send response
 * @returns True if response is async
 */
function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
): boolean {
  console.log('[content] Received message:', message.type, 'Full message:', message);

  try {
    switch (message.type) {
      case 'ACTIVATE_SELECTOR':
        const stashMode = message.payload?.stashImmediately || (message as any).stashImmediately || false;
        console.log('[content] Activating selector with stashMode:', stashMode);
        activateSelector(stashMode);
        sendResponse({ success: true, stashMode });
        break;

      case 'DEACTIVATE_SELECTOR':
        console.log('[content] Deactivating selector');
        deactivateSelector();
        sendResponse({ success: true });
        break;

      case 'ACTIVATE_CHAT_SELECTOR':
        console.log('[content] Activating chat selector');
        activateChatSelector();
        sendResponse({ success: true });
        break;

      case 'OPEN_INLINE_CHAT':
        console.log('[content] Opening inline chat');
        openInlineChat();
        sendResponse({ success: true });
        break;

      case 'CLOSE_INLINE_CHAT':
        console.log('[content] Closing inline chat');
        closeInlineChat();
        sendResponse({ success: true });
        break;

      case 'OPEN_ELEMENT_CHAT':
        console.log('[content] Opening element chat');
        openElementChat();
        sendResponse({ success: true });
        break;

      case 'TRIGGER_HYPERTEXT':
        console.log('[content] Triggering hypertext');
        if (hypertextService.isInitialized()) {
          const triggered = hypertextService.trigger();
          sendResponse({ success: triggered });
        } else {
          console.warn('[content] Hypertext service not initialized');
          sendResponse({ success: false, error: 'Hypertext not initialized' });
        }
        break;

      case 'GET_STATE':
        sendResponse({
          success: true,
          state: {
            isActive: state.isActive,
            hasCapture: state.capturedCard !== null,
            showingChat: state.showFloatingChat,
            inlineChatOpen: inlineChatState.isOpen,
          },
        });
        break;

      case 'PING':
        // Health check from background script
        sendResponse({ success: true, timestamp: Date.now() });
        break;

      default:
        console.warn('[content] Unknown message type:', (message as any).type);
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('[content] Error handling message:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Return false for synchronous response
  return false;
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

/**
 * Handles keyboard shortcuts for the content script
 *
 * @param event - The keyboard event
 */
function handleKeyboardShortcut(event: KeyboardEvent): void {
  // ESC key - deactivate selector
  if (event.key === 'Escape' && state.isActive) {
    // Don't handle if ElementSelector is handling it
    // (ElementSelector has its own ESC handler)
    // This is a backup in case something goes wrong
    if (!state.showFloatingChat) {
      event.preventDefault();
      deactivateSelector();
    }
  }

  // Cmd+Shift+E (Mac) or Ctrl+Shift+E (Windows/Linux) - toggle selector
  // Note: This is also handled by background script via commands API
  // This is a backup handler
  const modifierKey = event.metaKey || event.ctrlKey;
  if (modifierKey && event.shiftKey && event.key === 'E') {
    event.preventDefault();

    if (state.isActive) {
      deactivateSelector();
    } else {
      activateSelector();
    }
  }
}

// ============================================================================
// Initialization
// ============================================================================

async function bootstrapElementChatIndicators(): Promise<void> {
  try {
    const sessions = await getAllElementChats(window.location.href);
    syncIndicatorsForSessions(sessions);
  } catch (error) {
    console.warn('[content] Failed to bootstrap element chat indicators:', error);
  }
}

/**
 * Track right-clicked element for context menu
 */
function handleContextMenu(event: MouseEvent): void {
  // Store the element and position
  lastRightClickedElement = event.target as HTMLElement;
  lastRightClickPosition = { x: event.clientX, y: event.clientY };

  console.log('[content] Context menu opened on element:', lastRightClickedElement.tagName);
}

/**
 * Loads the hypertext-experience.js library dynamically
 */
async function loadHypertextLibrary(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).createHypertextExperience) {
      console.log('[content] Hypertext library already loaded');
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/lib/hypertext-experience.js');
    script.onload = () => {
      console.log('[content] Hypertext library loaded successfully');
      resolve();
    };
    script.onerror = (error) => {
      console.error('[content] Failed to load hypertext library:', error);
      reject(error);
    };
    document.head.appendChild(script);
  });
}

/**
 * Initializes the hypertext service
 */
async function initializeHypertext(): Promise<void> {
  try {
    // Load the hypertext library
    await loadHypertextLibrary();

    // Initialize the service
    hypertextService.init(document);

    console.log('[content] Hypertext service initialized');
  } catch (error) {
    console.error('[content] Failed to initialize hypertext:', error);
  }
}

/**
 * Initializes the content script
 *
 * Sets up message listeners and keyboard shortcuts.
 */
function initialize(): void {
  console.log('[content] Initializing Nabokov Web Clipper content script...');
  console.log('[content] Adding message listener...');

  // Add message listener
  chrome.runtime.onMessage.addListener(handleMessage);

  console.log('[content] Message listener added');
  console.log('[content] Testing inline chat function exists:', typeof openInlineChat);

  // Initialize element chat indicators
  initElementChatIndicators();
  void bootstrapElementChatIndicators();

  // Initialize hypertext (async, non-blocking)
  void initializeHypertext();

  // Add keyboard shortcut listener
  document.addEventListener('keydown', handleKeyboardShortcut, true);

  // Add context menu listener for tracking right-clicked elements
  document.addEventListener('contextmenu', handleContextMenu, true);

  // Send ready message to background
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCRIPT_READY',
    payload: {
      url: window.location.href,
      timestamp: Date.now(),
    },
  }).catch((error) => {
    // Ignore errors if background script isn't ready yet
    console.debug('[content] Could not send ready message:', error);
  });

  (window as any).__NABOKOV_EXTENSION_LOADED__ = true;
  console.log('[content] Content script initialized successfully');
}

// ============================================================================
// Cleanup on unload
// ============================================================================

/**
 * Cleanup function called when page unloads
 */
function cleanup(): void {
  console.log('[content] Cleaning up content script...');

  // Deactivate selector if active
  if (state.isActive) {
    deactivateSelector();
  }

  // Deactivate chat selector if active
  if (chatSelectorState.isActive) {
    deactivateChatSelector();
  }

  // Close inline chat if open
  if (inlineChatState.isOpen) {
    closeInlineChat();
  }

  // Close all element chat windows
  closeAllElementChatWindows();

  // Cleanup hypertext service
  if (hypertextService.isInitialized()) {
    hypertextService.destroy();
  }

  // Remove event listeners
  document.removeEventListener('keydown', handleKeyboardShortcut, true);
  document.removeEventListener('contextmenu', handleContextMenu, true);

  teardownElementChatIndicators();

  console.log('[content] Content script cleaned up');
}

// Add cleanup listener
window.addEventListener('beforeunload', cleanup);

// ============================================================================
// Entry Point
// ============================================================================

// Initialize immediately if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// ============================================================================
// Exports for testing
// ============================================================================

// Export functions for testing (these won't be available in production build)
if (process.env.NODE_ENV === 'development') {
  (window as any).__nabokobClipper__ = {
    activateSelector,
    deactivateSelector,
    getState: () => state,
    handleMessage,
  };
}

export { activateSelector, deactivateSelector };
