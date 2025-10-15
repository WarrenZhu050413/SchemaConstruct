/** @jsxImportSource @emotion/react */
/**
 * ElementSelector Component for Nabokov Web Clipper
 *
 * A React component that injects into the page as Shadow DOM to enable
 * visual selection of web page elements for clipping.
 *
 * Features:
 * - Visual overlay highlighting hoverable elements
 * - Chinese aesthetic styling (red/gold borders)
 * - Element info tooltip (tag name, classes, dimensions)
 * - Data storage to chrome.storage.local
 * - Keyboard shortcuts (ESC to deactivate)
 * - FloatingChat integration (placeholder for now)
 */

import { useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/react';
import { CHINESE_AESTHETIC_COLORS } from '../utils/shadowDOM';
import { sanitizeHTML, extractRelevantStyles, generateSelector } from '../utils/sanitization';
import { saveCard, generateId } from '../utils/storage';
import type { Card } from '@/types';
import type { ElementDescriptor } from '@/services/elementIdService';

/**
 * Props for ElementSelector component
 */
export interface ElementSelectorProps {
  /** Mode: 'capture' for card capture, 'chat' for attaching chat windows */
  mode?: 'capture' | 'chat';
  /** Callback fired when an element is successfully captured */
  onCapture?: (card: Card) => void;
  /** Callback fired when an element is selected for chat */
  onChatSelect?: (payload: {
    elements: HTMLElement[];
    descriptors: ElementDescriptor[];
    chatId: string;
    existingChatIds: Array<string | null>;
  }) => void | Promise<void>;
  /** Callback fired when selector is closed/deactivated */
  onClose?: () => void;
  /** Initial state of the stash immediately checkbox */
  initialStashState?: boolean;
}

/**
 * Type alias for React.FC to satisfy TypeScript
 */
type FC<P = {}> = (props: P) => JSX.Element | null;

/**
 * Element information for tooltip display
 */
interface ElementInfo {
  tagName: string;
  classes: string[];
  dimensions: { width: number; height: number };
  position: { x: number; y: number };
}

/**
 * Selected element data for multi-selection
 */
interface SelectedElement {
  element: HTMLElement;
  index: number;
  selector: string;
  html: string;
  position: { x: number; y: number };
  dimensions: { width: number; height: number };
}

/**
 * ElementSelector Component
 *
 * Provides visual element selection with overlay, tooltip, and capture functionality.
 */
export const ElementSelector: FC<ElementSelectorProps> = ({
  mode = 'capture',
  onCapture,
  onChatSelect,
  onClose,
  initialStashState = false,
}) => {
  // State management
  const isChatMode = mode === 'chat';
  const testMode =
    (typeof (navigator as any)?.webdriver === 'boolean' && (navigator as any).webdriver === true) ||
    (window as any).__NABOKOV_TEST_MODE__ === true;
  const [isActive, setIsActive] = useState(true);
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [elementInfo, setElementInfo] = useState<ElementInfo | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showFloatingChat, setShowFloatingChat] = useState(false);
  const [capturedCard, setCapturedCard] = useState<Card | null>(null);
  const [stashImmediately, setStashImmediately] = useState(initialStashState);

  // Multi-selection state (only used in capture mode)
  const [selections, setSelections] = useState<SelectedElement[]>([]);

  // Chat mode state
  const [existingChats, setExistingChats] = useState<Set<string>>(new Set());

  // Scroll tracking - triggers re-render to update overlay positions
  const [scrollTrigger, setScrollTrigger] = useState(0);

  // Refs (unused, reserved for future use)
  // const overlayRef = useRef<HTMLDivElement>(null);

  /**
   * Load existing chats for this page (chat mode only)
   */
  useEffect(() => {
    if (mode !== 'chat') {
      return;
    }

    const loadExistingChats = async () => {
      try {
        const { getAllElementChats } = await import('@/services/elementChatService');
        const { getElementChatId } = await import('@/services/elementIdService');

        const chats = await getAllElementChats(window.location.href);
        const chatIds = new Set<string>();

        // Find all elements with chat IDs and mark them
        chats.forEach(chat => {
          chatIds.add(chat.elementId);
        });

        // Also scan the DOM for elements with data-nabokov-chat-id
        const elementsWithChatIds = document.querySelectorAll('[data-nabokov-chat-id]');
        elementsWithChatIds.forEach(el => {
          if (el instanceof HTMLElement) {
            const chatId = getElementChatId(el);
            if (chatId) {
              chatIds.add(chatId);
            }
          }
        });

        setExistingChats(chatIds);
        console.log(`[ElementSelector] Loaded ${chatIds.size} existing chats for this page`);
      } catch (error) {
        console.warn('[ElementSelector] Failed to load existing chats:', error);
      }
    };

    loadExistingChats();
  }, [mode]);

  /**
   * Deactivates the selector and cleans up
   */
  const deactivate = useCallback(() => {
    setIsActive(false);
    setHoveredElement(null);
    setElementInfo(null);
    setSelections([]);
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  /**
   * Clear all selections
   */
  const clearSelections = useCallback(() => {
    setSelections([]);
  }, []);

  /**
   * Toggle element in/out of selection set
   */
  const toggleSelection = useCallback((element: HTMLElement, options?: { replace?: boolean }) => {
    setSelections(prev => {
      const working = options?.replace ? [] : prev;

      // Check if element is already selected
      const existingIndex = working.findIndex(s => s.element === element);

      if (existingIndex >= 0 && !options?.replace) {
        // Deselect: remove element and renumber remaining
        const updated = working.filter((_, i) => i !== existingIndex);
        return updated.map((sel, idx) => ({
          ...sel,
          index: idx + 1
        }));
      } else {
        // Check limit
        if (working.length >= 20) {
          alert('Maximum 20 elements. Please capture current selection first.');
          return working;
        }

        // Add to selection: capture HTML immediately
        const rect = element.getBoundingClientRect();
        const htmlContent = sanitizeHTML(element.outerHTML);
        const selector = generateSelector(element);

        const newSelection: SelectedElement = {
          element,
          index: working.length + 1,
          selector,
          html: htmlContent,
          position: {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY
          },
          dimensions: {
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };

        const updatedSelections = [...working, newSelection];
        console.log('[ElementSelector] Selection added', {
          selector,
          total: updatedSelections.length,
        });
        return updatedSelections;
      }
    });
  }, []);

  /**
   * Combine all selected elements and create single card
   */
  const combineAndCapture = useCallback(async () => {
    if (selections.length === 0) {
      return;
    }

    setIsCapturing(true);

    try {
      // Combine all HTML in selection order
      const combinedHTML = selections
        .map((sel, idx) => `
          <div class="captured-element" data-index="${idx + 1}">
            ${sel.html}
          </div>
        `)
        .join('\n\n');

      // Sanitize combined HTML
      const sanitized = sanitizeHTML(combinedHTML);

      // Create single card
      const cardId = generateId();
      const card: Card = {
        id: cardId,
        content: sanitized,
        metadata: {
          url: window.location.href,
          title: document.title,
          domain: new URL(window.location.href).hostname,
          timestamp: Date.now(),
          tagName: 'multi-element',
          selector: `${selections.length} elements combined`,
          textContent: selections.map(s => s.element.textContent || '').join(' '),
          dimensions: {
            width: 0,
            height: 0
          }
        },
        starred: false,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        conversation: [],
        cardType: 'clipped',
        stashed: stashImmediately
      };

      // Save to storage
      console.log('[ElementSelector] Saving combined card...');
      await saveCard(card);

      console.log('[ElementSelector] Combined capture successful!', {
        cardId,
        elementCount: selections.length,
        stashed: card.stashed
      });

      // Broadcast update
      try {
        await chrome.runtime.sendMessage({
          type: 'CARD_STASHED',
          cardId: card.id,
          stashed: card.stashed
        });
      } catch (broadcastError) {
        console.warn('[ElementSelector] Failed to broadcast update (non-critical):', broadcastError);
      }

      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));

      // Show success message
      alert(`Combined ${selections.length} elements into one card!`);

      // Clear selections
      clearSelections();

      // Auto-close
      setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, 500);

    } catch (error) {
      console.error('[ElementSelector] Error combining elements:', error);
      alert('Failed to combine elements. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [selections, stashImmediately, clearSelections, onClose]);

  /**
   * Start chat for a provided list of elements (chat mode helper)
   */
  const startChatForElements = useCallback(async (elements: HTMLElement[]) => {
    if (!isChatMode || !onChatSelect || elements.length === 0) {
      return;
    }

    try {
      const { assignGroupChatId, assignElementChatId, setElementChatId, getElementChatId, generateElementDescriptor } =
        await import('@/services/elementIdService');

      const existingChatIds = elements.map(el => getElementChatId(el));

      // Determine chat ID to use
      let chatId: string;
      if (elements.length === 1) {
        chatId = existingChatIds[0] ?? assignElementChatId(elements[0]);
      } else {
        const uniqueExisting = new Set(existingChatIds.filter((id): id is string => Boolean(id)));

        if (uniqueExisting.size === 1) {
          chatId = uniqueExisting.values().next().value as string;
          elements.forEach(el => setElementChatId(el, chatId));
        } else {
          chatId = assignGroupChatId(elements);
        }
      }

      // Ensure all elements share the chat ID before generating descriptors
      elements.forEach(el => setElementChatId(el, chatId));

      const descriptors: ElementDescriptor[] = elements.map(el => generateElementDescriptor(el));

      await Promise.resolve(
        onChatSelect({
          elements,
          descriptors,
          chatId,
          existingChatIds: existingChatIds.map(id => id ?? null)
        })
      );
    } catch (error) {
      console.error('[ElementSelector] Failed to start chat for elements:', error);
      alert('Failed to start chat for selected elements. Please try again.');
    }
  }, [isChatMode, onChatSelect]);

  /**
   * Launch chat for selected elements (chat mode)
   */
  const launchChatFromSelections = useCallback(async () => {
    if (!isChatMode || selections.length === 0) {
      return;
    }

    const elements = selections.map(sel => sel.element);
    console.log('[ElementSelector] Launching chat for selections', {
      count: selections.length,
      selectors: selections.map(sel => sel.selector),
    });
    await startChatForElements(elements);
    clearSelections();
    deactivate();
  }, [isChatMode, selections, startChatForElements, clearSelections, deactivate]);

  /**
   * Handles page scroll - triggers re-render to update overlay positions
   */
  const handleScroll = useCallback(() => {
    // Increment counter to trigger re-render
    // This causes SelectionBadge, SelectionOutline, and ElementHighlight
    // to recalculate positions via getBoundingClientRect()
    setScrollTrigger(prev => prev + 1);
  }, []);

  /**
   * Handles keyboard shortcuts
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (selections.length > 0) {
          clearSelections();
        } else {
          deactivate();
        }
      } else if (e.key === 'Enter' && selections.length > 0) {
        e.preventDefault();
        if (isChatMode) {
          void launchChatFromSelections();
        } else {
          void combineAndCapture();
        }
      }
    },
    [deactivate, clearSelections, selections, isChatMode, launchChatFromSelections, combineAndCapture]
  );

  /**
   * Handles mouse move over elements
   */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Don't highlight if we're capturing or showing chat
    if (isCapturing || showFloatingChat) {
      return;
    }

    // Get element at cursor position
    const target = e.target as HTMLElement;

    // Ignore elements that are part of our overlay
    if (target.closest('[data-nabokov-overlay]')) {
      return;
    }

    // Ignore script, style, and other non-visual elements
    const ignoredTags = ['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD'];
    if (ignoredTags.includes(target.tagName)) {
      return;
    }

    setHoveredElement(target);

    // Update element info for tooltip
    const rect = target.getBoundingClientRect();
    const classes = Array.from(target.classList);

    setElementInfo({
      tagName: target.tagName.toLowerCase(),
      classes,
      dimensions: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      position: {
        x: e.clientX,
        y: e.clientY,
      },
    });
  }, [isCapturing, showFloatingChat]);

  /**
   * Handles element click for capture or chat
   */
  const handleClick = useCallback(
    async (e: MouseEvent) => {
      // Prevent default action
      e.preventDefault();
      e.stopPropagation();

      let target = e.target as HTMLElement;

      // Ignore clicks on our overlay by re-mapping to the underlying element
      if (target.closest('[data-nabokov-overlay]')) {
        const underlying = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        if (!underlying || underlying.closest('[data-nabokov-overlay]')) {
          return;
        }
        target = underlying;
      }

      // Ignore clicks on ignored tags
      const ignoredTags = ['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD'];
      if (ignoredTags.includes(target.tagName)) {
        return;
      }

      // CHAT MODE: Attach chat to element (supports multi-selection)
      if (isChatMode) {
        const multiSelect = e.metaKey || e.ctrlKey;

        if (multiSelect) {
          toggleSelection(target);
          return;
        }

        if (selections.length === 0) {
          const existingChatId = target.getAttribute('data-nabokov-chat-id');
          const hasExistingChat = existingChatId ? true : existingChats.size > 0;

          if (hasExistingChat) {
            await startChatForElements([target]);
            deactivate();
          } else {
            toggleSelection(target, { replace: true });
          }
          return;
        }

        const alreadySelected = selections.some(sel => sel.element === target);

        if (alreadySelected) {
          void launchChatFromSelections();
          return;
        }

        toggleSelection(target, { replace: true });
        return;
      }

      // CAPTURE MODE: Continue with existing capture logic
      // Check if Cmd/Ctrl key is held for multi-selection
      if (e.metaKey || e.ctrlKey) {
        // Multi-select mode: toggle element in selection
        toggleSelection(target);
        return;
      }

      // Single-click without modifier: immediate capture (legacy behavior)
      // But if we have selections, ignore single clicks
      if (selections.length > 0) {
        return;
      }

      setSelectedElement(target);
      setIsCapturing(true);

      try {
        // Generate unique ID for card
        const cardId = generateId();

        // Capture element data
        console.log('[ElementSelector] Capturing element:', target);

        // 1. Sanitize HTML content
        const htmlContent = sanitizeHTML(target.outerHTML);

        // 2. Extract relevant styles
        const styles = extractRelevantStyles(target);

        // 3. Generate CSS selector
        const selector = generateSelector(target);

        // 4. Get surrounding context (parent element snippet)
        const context = target.parentElement
          ? sanitizeHTML(target.parentElement.outerHTML)
          : undefined;

        // 5. Get element metadata
        const rect = target.getBoundingClientRect();
        const classes = Array.from(target.classList);
        const textContent = target.textContent || '';

        // 6. Create card in unified Card format
        const card: Card = {
          id: cardId,
          content: htmlContent,
          metadata: {
            url: window.location.href,
            title: document.title,
            domain: new URL(window.location.href).hostname,
            timestamp: Date.now(),
            tagName: target.tagName.toLowerCase(),
            selector,
            textContent: textContent,
            dimensions: {
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          },
          starred: false,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          conversation: [],
          // Additional fields for rendering
          styles,
          context,
          // Stash immediately if checkbox is checked
          stashed: stashImmediately,
        };

        // 7. Save to storage
        console.log('[ElementSelector] Saving card...');

        // Save card to chrome.storage.local
        await saveCard(card);

        console.log('[ElementSelector] Capture successful!', {
          cardId,
          stashed: card.stashed,
          stashMode: stashImmediately
        });

        // Check if auto-beautification is enabled
        try {
          const { settingsService } = await import('@/services/settingsService');
          const autoBeautify = await settingsService.getAutoBeautify();

          if (autoBeautify && card.content && !card.stashed) {
            console.log('[ElementSelector] Auto-beautification enabled, beautifying card...');
            const { beautificationService } = await import('@/services/beautificationService');
            const mode = await settingsService.getAutoBeautifyMode();

            // Beautify in background (non-blocking)
            beautificationService.beautifyCard(cardId, mode).catch(error => {
              console.warn('[ElementSelector] Auto-beautification failed (non-critical):', error);
            });
          }
        } catch (error) {
          console.warn('[ElementSelector] Failed to check auto-beautify setting:', error);
        }

        // Broadcast to all extension contexts via chrome.runtime
        try {
          await chrome.runtime.sendMessage({
            type: 'CARD_STASHED',
            cardId: card.id,
            stashed: card.stashed
          });
          console.log('[ElementSelector] Broadcast message sent successfully');
        } catch (broadcastError) {
          // Non-critical error - card is already saved locally
          console.warn('[ElementSelector] Failed to broadcast update (non-critical):', broadcastError);
        }

        // Also keep local event for same-page updates
        window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));
        console.log('[ElementSelector] Local event dispatched');

        // 8. Show floating chat at element position
        setCapturedCard(card);
        setShowFloatingChat(true);

        // 9. Fire callback
        if (onCapture) {
          onCapture(card);
        }

        // 10. Auto-close after 2 seconds
        setTimeout(() => {
          if (onClose) {
            onClose();
          }
        }, 2000);

      } catch (error) {
        console.error('[ElementSelector] Error capturing element:', error);
        alert('Failed to capture element. Please try again.');
      } finally {
        setIsCapturing(false);
      }
    },
    [
      mode,
      onCapture,
      onChatSelect,
      onClose,
      stashImmediately,
      selections,
      toggleSelection,
      isChatMode,
      launchChatFromSelections,
      deactivate,
      existingChats,
      startChatForElements,
    ]
  );

  /**
   * Set up event listeners
   */
  useEffect(() => {
    if (!isActive) {
      return;
    }

    // Add keyboard listener
    window.addEventListener('keydown', handleKeyDown, true);

    // Add mouse move listener
    window.addEventListener('mousemove', handleMouseMove, true);

    // Add click listener
    window.addEventListener('click', handleClick, true);

    // Add scroll listener to update overlay positions
    window.addEventListener('scroll', handleScroll, true);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousemove', handleMouseMove, true);
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isActive, handleKeyDown, handleMouseMove, handleClick, handleScroll]);

  /**
   * Don't render anything if not active
   */
  if (!isActive) {
    return null;
  }

  return (
    <div data-nabokov-overlay css={overlayContainerStyles}>
      {/* Overlay highlight for hovered element */}
      {hoveredElement && !showFloatingChat && selections.length === 0 && (
        <ElementHighlight element={hoveredElement} mode={mode} existingChats={existingChats} />
      )}

      {/* Chat indicator badge for hovered element with existing chat */}
      {mode === 'chat' && hoveredElement && !showFloatingChat && selections.length === 0 && (
        <ChatIndicatorBadge element={hoveredElement} existingChats={existingChats} />
      )}

      {/* Tooltip showing element info */}
      {elementInfo && !showFloatingChat && selections.length === 0 && (
        <ElementTooltip info={elementInfo} />
      )}

      {/* Selection badges and outlines */}
      {selections.map((sel) => (
        <div key={sel.index}>
          <SelectionOutline selection={sel} />
          <SelectionBadge selection={sel} />
        </div>
      ))}

      {/* Multi-select action panel */}
      {selections.length > 0 && !showFloatingChat && !testMode && (
        <MultiSelectActionPanel
          selections={selections}
          onPrimaryAction={isChatMode ? () => { void launchChatFromSelections(); } : () => { void combineAndCapture(); }}
          onClear={clearSelections}
          mode={mode}
        />
      )}

      {/* Loading indicator during capture */}
      {isCapturing && (
        <div css={loadingOverlayStyles}>
          <div css={loadingSpinnerStyles}>
            <div css={spinnerDotStyles} />
            <div css={spinnerDotStyles} />
            <div css={spinnerDotStyles} />
          </div>
          <p css={loadingTextStyles}>
            {selections.length > 0 ? `Combining ${selections.length} elements...` : 'Capturing element...'}
          </p>
        </div>
      )}

      {/* Floating chat component (placeholder) */}
      {showFloatingChat && capturedCard && selectedElement && (
        <FloatingChatPlaceholder
          card={capturedCard}
          element={selectedElement}
          onClose={() => {
            setShowFloatingChat(false);
            deactivate();
          }}
        />
      )}

      {/* Mode indicator banner */}
      {!showFloatingChat && !testMode && (
        <div css={modeIndicatorStyles(mode === 'chat' ? 'chat' : (stashImmediately ? 'stash' : 'canvas'))}>
          <div css={modeIconStyles}>
            {mode === 'chat' ? '💬' : (stashImmediately ? '📥' : '🎨')}
          </div>
          <div css={modeTitleStyles}>
            {mode === 'chat' ? 'CHAT MODE' : (stashImmediately ? 'STASH MODE' : 'CANVAS MODE')}
          </div>
          <div css={modeDescStyles}>
            {isChatMode
              ? 'Click to chat • Cmd/Ctrl+Click to multi-select • ESC to cancel'
              : (stashImmediately
                ? 'Cards will be saved to Side Panel'
                : 'Cards will appear on Canvas')}
          </div>
        </div>
      )}

      {/* Instructions overlay */}
      {!showFloatingChat && !testMode && (
        <div css={instructionsStyles}>
          <p>
            {isChatMode
              ? (selections.length > 0
                ? `${selections.length} selected • Enter or click to start chat • ESC to clear`
                : 'Hover to inspect • Click to chat • Cmd/Ctrl+Click for multiple • ESC to cancel')
              : (selections.length > 0
                ? `${selections.length} selected • Cmd/Ctrl+Click to add/remove • Enter to capture • ESC to clear`
                : 'Hover to inspect • Click to capture • Cmd/Ctrl+Click for multiple • ESC to cancel')}
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * ElementHighlight - Draws a border around the hovered element
 */
const ElementHighlight: FC<{
  element: HTMLElement;
  mode: 'capture' | 'chat';
  existingChats: Set<string>;
}> = ({ element, mode, existingChats }) => {
  const rect = element.getBoundingClientRect();

  const [hasChat, setHasChat] = useState(false);

  useEffect(() => {
    if (mode !== 'chat') {
      return;
    }

    const checkExistingChat = async (): Promise<boolean> => {
      try {
        const { getElementChatId } = await import('@/services/elementIdService');
        const chatId = getElementChatId(element);
        if (chatId === null) {
          return false;
        }
        return existingChats.has(chatId);
      } catch {
        return false;
      }
    };

    checkExistingChat().then(result => setHasChat(result));
  }, [element, mode, existingChats]);

  return (
    <div
      css={highlightStyles(mode, hasChat)}
      style={{
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    />
  );
};

/**
 * ElementTooltip - Shows element information near cursor
 */
const ElementTooltip: FC<{ info: ElementInfo }> = ({ info }) => {
  const { tagName, classes, dimensions, position } = info;

  // Position tooltip above and to the right of cursor
  const tooltipX = position.x + 15;
  const tooltipY = position.y - 60;

  return (
    <div
      css={tooltipStyles}
      style={{
        top: `${tooltipY}px`,
        left: `${tooltipX}px`,
      }}
    >
      <div css={tooltipRowStyles}>
        <strong>{tagName}</strong>
        {classes.length > 0 && (
          <span css={tooltipClassesStyles}>
            .{classes.join('.')}
          </span>
        )}
      </div>
      <div css={tooltipRowStyles}>
        <span css={tooltipDimStyles}>
          {dimensions.width} × {dimensions.height}px
        </span>
      </div>
    </div>
  );
};

/**
 * ChatIndicatorBadge - Shows 💬 badge on elements with existing chats
 */
const ChatIndicatorBadge: FC<{
  element: HTMLElement;
  existingChats: Set<string>;
}> = ({ element, existingChats }) => {
  const [hasChat, setHasChat] = useState(false);

  useEffect(() => {
    const checkChat = async () => {
      try {
        const { getElementChatId } = await import('@/services/elementIdService');
        const chatId = getElementChatId(element);
        setHasChat(chatId !== null && existingChats.has(chatId));
      } catch {
        setHasChat(false);
      }
    };
    checkChat();
  }, [element, existingChats]);

  if (!hasChat) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return (
    <div
      css={chatIndicatorBadgeStyles}
      style={{
        top: `${rect.top - 12}px`,
        left: `${rect.left - 12}px`,
      }}
    >
      💬
    </div>
  );
};

/**
 * SelectionBadge - Shows numbered badge for selected element
 */
const SelectionBadge: FC<{ selection: SelectedElement }> = ({ selection }) => {
  const rect = selection.element.getBoundingClientRect();

  return (
    <div
      css={selectionBadgeStyles}
      style={{
        top: `${rect.top - 12}px`,
        left: `${rect.left - 12}px`,
      }}
    >
      {selection.index}
    </div>
  );
};

/**
 * SelectionOutline - Shows outline for selected element
 */
const SelectionOutline: FC<{ selection: SelectedElement }> = ({ selection }) => {
  const rect = selection.element.getBoundingClientRect();

  return (
    <div
      css={selectionOutlineStyles}
      style={{
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    />
  );
};

/**
 * MultiSelectActionPanel - Floating panel for multi-selection actions
 */
const MultiSelectActionPanel: FC<{
  selections: SelectedElement[];
  onPrimaryAction: () => void;
  onClear: () => void;
  mode: 'capture' | 'chat';
}> = ({ selections, onPrimaryAction, onClear, mode }) => {
  const primaryLabel = mode === 'chat' ? '💬 Start Chat' : '📥 Capture All';

  return (
    <div css={actionPanelStyles}>
      <div css={actionPanelHeaderStyles}>
        <span css={actionPanelCountStyles}>{selections.length}</span> element{selections.length > 1 ? 's' : ''} selected
      </div>

      <div css={actionPanelListStyles}>
        {selections.map((sel, idx) => (
          <div key={idx} css={actionPanelItemStyles}>
            {sel.index}. {sel.selector}
          </div>
        ))}
      </div>

      <div css={actionPanelButtonsStyles}>
        <button css={captureButtonStyles} onClick={onPrimaryAction}>
          {primaryLabel}
        </button>
        <button css={clearButtonStyles} onClick={onClear}>
          ✕ Clear
        </button>
      </div>
    </div>
  );
};

/**
 * FloatingChatPlaceholder - Placeholder for FloatingChat component
 * TODO: Replace with actual FloatingChat component
 */
const FloatingChatPlaceholder: FC<{
  card: Card;
  element: HTMLElement;
  onClose: () => void;
}> = ({ card, element, onClose }) => {
  const rect = element.getBoundingClientRect();

  return (
    <div
      css={floatingChatStyles}
      style={{
        top: `${rect.bottom + 10}px`,
        left: `${rect.left}px`,
      }}
    >
      <div css={chatHeaderStyles}>
        <h3>Element Captured!</h3>
        <button onClick={onClose} css={chatCloseButtonStyles}>
          ×
        </button>
      </div>
      <div css={chatContentStyles}>
        <p>
          <strong>Tag:</strong> {card.metadata.tagName}
        </p>
        <p>
          <strong>Dimensions:</strong> {card.metadata.dimensions?.width} ×{' '}
          {card.metadata.dimensions?.height}px
        </p>
        <p>
          <strong>Text length:</strong> {card.metadata.textContent?.length} characters
        </p>
        <p css={successTextStyles}>
          Saved to your collection!
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// Emotion CSS Styles with Chinese Aesthetic
// =============================================================================

const overlayContainerStyles = css`
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
`;

const highlightStyles = (mode: 'capture' | 'chat', hasExistingChat: boolean) => css`
  position: fixed;
  pointer-events: none;
  border: 3px solid ${
    mode === 'chat'
      ? (hasExistingChat ? '#C77DFF' : '#7B2CBF')
      : CHINESE_AESTHETIC_COLORS.cinnabar
  };
  box-shadow:
    0 0 0 1px ${
      mode === 'chat'
        ? (hasExistingChat ? '#E0AAFF' : '#9D4EDD')
        : CHINESE_AESTHETIC_COLORS.gold
    },
    0 4px 16px ${
      mode === 'chat'
        ? (hasExistingChat ? 'rgba(199, 125, 255, 0.4)' : 'rgba(123, 44, 191, 0.3)')
        : 'rgba(194, 59, 34, 0.3)'
    };
  background-color: ${
    mode === 'chat'
      ? (hasExistingChat ? 'rgba(199, 125, 255, 0.08)' : 'rgba(123, 44, 191, 0.05)')
      : 'rgba(194, 59, 34, 0.05)'
  };
  transition: all 150ms ease-in-out;
  z-index: 999998;
  border-radius: 2px;
`;

const tooltipStyles = css`
  position: fixed;
  pointer-events: none;
  background: linear-gradient(
    135deg,
    ${CHINESE_AESTHETIC_COLORS.ink} 0%,
    ${CHINESE_AESTHETIC_COLORS.indigo} 100%
  );
  color: ${CHINESE_AESTHETIC_COLORS.rice};
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 0 0 1px ${CHINESE_AESTHETIC_COLORS.gold};
  z-index: 999999;
  min-width: 120px;
  border: 1px solid ${CHINESE_AESTHETIC_COLORS.gold};
  backdrop-filter: blur(8px);
`;

const tooltipRowStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;

  &:last-child {
    margin-bottom: 0;
  }

  strong {
    color: ${CHINESE_AESTHETIC_COLORS.gold};
    font-weight: 600;
  }
`;

const tooltipClassesStyles = css`
  font-size: 11px;
  opacity: 0.9;
  color: ${CHINESE_AESTHETIC_COLORS.lotus};
  font-family: 'Courier New', monospace;
`;

const tooltipDimStyles = css`
  font-size: 11px;
  opacity: 0.8;
  color: ${CHINESE_AESTHETIC_COLORS.bamboo};
`;

const instructionsStyles = css`
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(
    135deg,
    ${CHINESE_AESTHETIC_COLORS.indigo} 0%,
    ${CHINESE_AESTHETIC_COLORS.azurite} 100%
  );
  color: ${CHINESE_AESTHETIC_COLORS.rice};
  padding: 12px 24px;
  border-radius: 24px;
  font-size: 14px;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.4),
    0 0 0 2px ${CHINESE_AESTHETIC_COLORS.gold};
  z-index: 999999;
  pointer-events: auto;
  border: 1px solid ${CHINESE_AESTHETIC_COLORS.gold};
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;

  p {
    margin: 0;
    font-weight: 500;
  }
`;

const modeIndicatorStyles = (mode: 'chat' | 'stash' | 'canvas') => css`
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: ${
    mode === 'chat'
      ? 'linear-gradient(135deg, #7B2CBF 0%, #5A189A 100%)'
      : mode === 'stash'
      ? 'linear-gradient(135deg, #2C5F7E 0%, #1E3A5F 100%)'
      : `linear-gradient(135deg, ${CHINESE_AESTHETIC_COLORS.cinnabar} 0%, #8B0000 100%)`
  };
  color: ${CHINESE_AESTHETIC_COLORS.rice};
  padding: 16px 32px;
  border-radius: 16px;
  font-size: 16px;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.5),
    0 0 0 3px ${
      mode === 'chat'
        ? '#C77DFF'
        : mode === 'stash'
        ? '#5DADE2'
        : CHINESE_AESTHETIC_COLORS.gold
    };
  z-index: 999999;
  pointer-events: auto;
  border: 2px solid ${
    mode === 'chat'
      ? '#C77DFF'
      : mode === 'stash'
      ? '#5DADE2'
      : CHINESE_AESTHETIC_COLORS.gold
  };
  display: flex;
  align-items: center;
  gap: 16px;
  animation: slideDown 0.3s ease-out;

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
`;

const modeIconStyles = css`
  font-size: 32px;
  line-height: 1;
`;

const modeTitleStyles = css`
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 1px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
`;

const modeDescStyles = css`
  font-size: 13px;
  opacity: 0.9;
  font-weight: 500;
`;

const loadingOverlayStyles = css`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(44, 62, 80, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  z-index: 1000000;
  pointer-events: auto;
`;

const loadingSpinnerStyles = css`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const spinnerDotStyles = css`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${CHINESE_AESTHETIC_COLORS.gold};
  animation: bounce 1.4s infinite ease-in-out;

  &:nth-of-type(1) {
    animation-delay: -0.32s;
  }

  &:nth-of-type(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0);
      opacity: 0.5;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }
`;

const loadingTextStyles = css`
  color: ${CHINESE_AESTHETIC_COLORS.rice};
  font-size: 16px;
  font-weight: 500;
  margin: 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
`;

const floatingChatStyles = css`
  position: absolute;
  background: ${CHINESE_AESTHETIC_COLORS.silk};
  border: 2px solid ${CHINESE_AESTHETIC_COLORS.gold};
  border-radius: 8px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    0 0 0 1px ${CHINESE_AESTHETIC_COLORS.cinnabar};
  z-index: 1000001;
  pointer-events: auto;
  min-width: 320px;
  max-width: 400px;
  backdrop-filter: blur(8px);
`;

const chatHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(
    135deg,
    ${CHINESE_AESTHETIC_COLORS.indigo} 0%,
    ${CHINESE_AESTHETIC_COLORS.azurite} 100%
  );
  border-bottom: 1px solid ${CHINESE_AESTHETIC_COLORS.gold};
  border-radius: 6px 6px 0 0;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: ${CHINESE_AESTHETIC_COLORS.rice};
  }
`;

const chatCloseButtonStyles = css`
  background: transparent;
  border: none;
  color: ${CHINESE_AESTHETIC_COLORS.rice};
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 150ms ease-in-out;
  border-radius: 4px;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const chatContentStyles = css`
  padding: 16px;

  p {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: ${CHINESE_AESTHETIC_COLORS.ink};
    line-height: 1.5;

    &:last-child {
      margin-bottom: 0;
    }

    strong {
      color: ${CHINESE_AESTHETIC_COLORS.indigo};
      font-weight: 600;
    }
  }
`;

const successTextStyles = css`
  margin-top: 12px !important;
  padding-top: 12px;
  border-top: 1px solid ${CHINESE_AESTHETIC_COLORS.bamboo};
  color: ${CHINESE_AESTHETIC_COLORS.verdigris} !important;
  font-weight: 600 !important;
  font-size: 13px !important;
`;

// Multi-selection styles

const chatIndicatorBadgeStyles = css`
  position: fixed;
  pointer-events: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #C77DFF 0%, #7B2CBF 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  box-shadow:
    0 2px 8px rgba(123, 44, 191, 0.4),
    0 0 0 2px #E0AAFF;
  z-index: 999999;
  animation: chatBadgePulse 2s ease-in-out infinite;

  @keyframes chatBadgePulse {
    0%, 100% {
      transform: scale(1);
      box-shadow:
        0 2px 8px rgba(123, 44, 191, 0.4),
        0 0 0 2px #E0AAFF;
    }
    50% {
      transform: scale(1.1);
      box-shadow:
        0 4px 12px rgba(123, 44, 191, 0.6),
        0 0 0 3px #E0AAFF;
    }
  }
`;

const selectionBadgeStyles = css`
  position: fixed;
  pointer-events: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${CHINESE_AESTHETIC_COLORS.cinnabar};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  box-shadow:
    0 2px 8px rgba(139, 0, 0, 0.4),
    0 0 0 2px ${CHINESE_AESTHETIC_COLORS.gold};
  z-index: 999999;
  animation: badgeFadeIn 0.3s ease-out;

  @keyframes badgeFadeIn {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`;

const selectionOutlineStyles = css`
  position: fixed;
  pointer-events: none;
  border: 3px solid ${CHINESE_AESTHETIC_COLORS.cinnabar};
  box-shadow:
    0 0 0 3px ${CHINESE_AESTHETIC_COLORS.gold},
    0 4px 16px rgba(194, 59, 34, 0.4);
  background-color: rgba(194, 59, 34, 0.08);
  z-index: 999998;
  border-radius: 2px;
  animation: outlineFadeIn 0.3s ease-out;

  @keyframes outlineFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const actionPanelStyles = css`
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: white;
  border: 2px solid ${CHINESE_AESTHETIC_COLORS.gold};
  border-radius: 8px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    0 0 0 1px ${CHINESE_AESTHETIC_COLORS.cinnabar};
  z-index: 1000000;
  pointer-events: auto;
  max-width: 350px;
  animation: slideUp 0.3s ease-out;

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const actionPanelHeaderStyles = css`
  padding: 12px 16px;
  background: linear-gradient(
    135deg,
    ${CHINESE_AESTHETIC_COLORS.cinnabar} 0%,
    #8B0000 100%
  );
  color: white;
  font-size: 14px;
  font-weight: 600;
  border-radius: 6px 6px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const actionPanelCountStyles = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${CHINESE_AESTHETIC_COLORS.gold};
  color: ${CHINESE_AESTHETIC_COLORS.ink};
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
`;

const actionPanelListStyles = css`
  max-height: 150px;
  overflow-y: auto;
  padding: 8px 12px;
  background: ${CHINESE_AESTHETIC_COLORS.silk};
`;

const actionPanelItemStyles = css`
  font-size: 12px;
  color: ${CHINESE_AESTHETIC_COLORS.ink};
  padding: 4px 0;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:not(:last-child) {
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  }
`;

const actionPanelButtonsStyles = css`
  padding: 12px;
  display: flex;
  gap: 8px;
  border-top: 1px solid ${CHINESE_AESTHETIC_COLORS.bamboo};
`;

const captureButtonStyles = css`
  flex: 1;
  background: linear-gradient(
    135deg,
    ${CHINESE_AESTHETIC_COLORS.cinnabar} 0%,
    #8B0000 100%
  );
  color: white;
  border: 1px solid ${CHINESE_AESTHETIC_COLORS.gold};
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  box-shadow: 0 2px 8px rgba(139, 0, 0, 0.2);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(139, 0, 0, 0.3);
  }

  &:active {
    transform: translateY(0);
  }
`;

const clearButtonStyles = css`
  background: transparent;
  color: ${CHINESE_AESTHETIC_COLORS.ink};
  border: 1px solid ${CHINESE_AESTHETIC_COLORS.bamboo};
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    border-color: ${CHINESE_AESTHETIC_COLORS.cinnabar};
    color: ${CHINESE_AESTHETIC_COLORS.cinnabar};
  }

  &:active {
    background: rgba(0, 0, 0, 0.1);
  }
`;

export default ElementSelector;
