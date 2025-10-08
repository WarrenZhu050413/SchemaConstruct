/**
 * Text Selection Highlight Service
 *
 * Manages persistent highlighting of selected text using CSS Highlights API (primary)
 * with DOM wrapping fallback for browsers without support.
 *
 * Features:
 * - Non-invasive highlighting via CSS Highlights API
 * - State-based colors (loading, active, error)
 * - Dark mode support
 * - Text position serialization for persistence
 * - Overlap prevention
 * - DOM mutation cleanup
 */

import { generateId } from '@/utils/storage';

// Check if CSS Highlights API is available
const supportsHighlightsAPI = typeof CSS !== 'undefined' && 'highlights' in CSS;

export interface TextSelectionSession {
  id: string;
  serializedRange: TextPositionSelector;
  selectedText: string;
  state: 'loading' | 'active' | 'error';
  createdAt: number;
  highlight?: Highlight; // CSS Highlights API
  fallbackSpan?: HTMLElement; // DOM wrapping fallback
}

export interface TextPositionSelector {
  type: 'TextPositionSelector';
  start: number;
  end: number;
  textContent: string; // For validation
}

const sessions = new Map<string, TextSelectionSession>();

/**
 * Create a new text selection session
 */
export function createTextSelectionSession(
  selection: Selection,
  options: { allowOverlap?: boolean } = {}
): TextSelectionSession | null {
  console.log('[TextHighlight] Creating session, rangeCount:', selection.rangeCount);

  if (!selection.rangeCount) {
    console.warn('[TextHighlight] No ranges in selection');
    return null;
  }

  const range = selection.getRangeAt(0);
  const selectedText = range.toString().trim();

  console.log('[TextHighlight] Selected text:', selectedText.substring(0, 50));
  console.log('[TextHighlight] Range:', {
    startContainer: range.startContainer.nodeName,
    endContainer: range.endContainer.nodeName,
    startOffset: range.startOffset,
    endOffset: range.endOffset
  });

  if (!selectedText) {
    console.warn('[TextHighlight] Empty selected text');
    return null;
  }

  // Check for overlaps
  if (!options.allowOverlap) {
    const overlapping = hasOverlappingHighlight(range);
    if (overlapping) {
      console.warn('[TextHighlight] Overlapping highlight detected:', overlapping);
      return null;
    }
  }

  // Serialize range for persistence
  console.log('[TextHighlight] Serializing range...');
  const serialized = serializeRange(range);
  if (!serialized) {
    console.warn('[TextHighlight] Failed to serialize range');
    return null;
  }

  console.log('[TextHighlight] Serialized range:', serialized);

  const session: TextSelectionSession = {
    id: generateId(),
    serializedRange: serialized,
    selectedText,
    state: 'loading',
    createdAt: Date.now()
  };

  sessions.set(session.id, session);
  console.log('[TextHighlight] Session created:', session.id);
  return session;
}

/**
 * Apply or update highlight for a session
 */
export function applyHighlight(
  sessionId: string,
  state: 'loading' | 'active' | 'error'
): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  session.state = state;

  if (supportsHighlightsAPI) {
    return applyHighlightAPI(session);
  } else {
    return applyFallbackHighlight(session);
  }
}

/**
 * Remove highlight for a session
 */
export function removeHighlight(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.highlight && supportsHighlightsAPI) {
    // CSS Highlights API
    CSS.highlights.delete(`nabokov-selection-${sessionId}`);

    // Remove style element
    const styleEl = document.getElementById(`nabokov-highlight-styles-${sessionId}`);
    if (styleEl) {
      styleEl.remove();
    }
  }

  if (session.fallbackSpan) {
    // DOM wrapping fallback - unwrap
    const parent = session.fallbackSpan.parentNode;
    if (parent) {
      while (session.fallbackSpan.firstChild) {
        parent.insertBefore(session.fallbackSpan.firstChild, session.fallbackSpan);
      }
      parent.removeChild(session.fallbackSpan);
    }
  }

  sessions.delete(sessionId);
}

/**
 * Check if a range overlaps with any existing highlights
 */
export function hasOverlappingHighlight(range: Range): string | null {
  const startOffset = getTextOffset(document.body, range.startContainer, range.startOffset);
  const endOffset = getTextOffset(document.body, range.endContainer, range.endOffset);

  if (startOffset === null || endOffset === null) return null;

  // Check all existing sessions for overlap
  for (const [sessionId, session] of sessions.entries()) {
    const existingStart = session.serializedRange.start;
    const existingEnd = session.serializedRange.end;

    // Check for overlap
    if (!(endOffset <= existingStart || startOffset >= existingEnd)) {
      return sessionId; // Found overlap
    }
  }

  return null;
}

// ============================================================================
// CSS Highlights API Implementation
// ============================================================================

function applyHighlightAPI(session: TextSelectionSession): boolean {
  try {
    // Deserialize range from text position
    const range = deserializeRange(session.serializedRange);
    if (!range) return false;

    // Create CSS Highlight
    const highlight = new Highlight(range);
    CSS.highlights.set(`nabokov-selection-${session.id}`, highlight);

    session.highlight = highlight;

    // Apply styles via CSS
    injectHighlightStyles(session.id, session.state);

    return true;
  } catch (error) {
    console.error('[TextHighlight] CSS Highlights API failed:', error);
    return false;
  }
}

function injectHighlightStyles(sessionId: string, state: string): void {
  const existingStyle = document.getElementById(`nabokov-highlight-styles-${sessionId}`);
  if (existingStyle) {
    existingStyle.remove();
  }

  const colors = getStateColors(state);

  const style = document.createElement('style');
  style.id = `nabokov-highlight-styles-${sessionId}`;
  style.textContent = `
    ::highlight(nabokov-selection-${sessionId}) {
      background-color: ${colors.background};
      text-decoration: underline 2px ${colors.underline};
      text-decoration-skip-ink: none;
    }
  `;

  document.head.appendChild(style);
}

function getStateColors(state: string): {
  background: string;
  underline: string;
} {
  // Check for dark mode
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  switch (state) {
    case 'loading':
      return {
        background: isDark ? 'rgba(108, 108, 108, 0.2)' : 'rgba(108, 108, 108, 0.1)',
        underline: isDark ? 'rgba(108, 108, 108, 0.8)' : 'rgba(108, 108, 108, 0.6)'
      };
    case 'active':
      return {
        background: isDark ? 'rgba(177, 64, 60, 0.25)' : 'rgba(177, 64, 60, 0.15)',
        underline: isDark ? 'rgba(177, 64, 60, 0.9)' : 'rgba(177, 64, 60, 0.6)'
      };
    case 'error':
      return {
        background: isDark ? 'rgba(178, 34, 34, 0.25)' : 'rgba(178, 34, 34, 0.15)',
        underline: isDark ? 'rgba(178, 34, 34, 0.9)' : 'rgba(178, 34, 34, 0.6)'
      };
    default:
      return { background: 'transparent', underline: 'transparent' };
  }
}

// ============================================================================
// DOM Wrapping Fallback (for Firefox/Safari)
// ============================================================================

function applyFallbackHighlight(session: TextSelectionSession): boolean {
  try {
    const range = deserializeRange(session.serializedRange);
    if (!range) return false;

    // Check if selection is safe to wrap
    if (!isSafeToWrap(range)) {
      console.warn('[TextHighlight] Selection not safe to wrap');
      return false;
    }

    // Create wrapper span
    const span = document.createElement('span');
    span.className = 'nabokov-text-highlight';
    span.dataset.sessionId = session.id;
    span.dataset.state = session.state;

    // Apply inline styles
    const colors = getStateColors(session.state);
    Object.assign(span.style, {
      backgroundColor: colors.background,
      textDecoration: `underline 2px ${colors.underline}`,
      textDecorationSkipInk: 'none',
      cursor: 'pointer',
      position: 'relative'
    });

    // Try to wrap
    try {
      range.surroundContents(span);
    } catch (e) {
      // Fallback: extract and append
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }

    session.fallbackSpan = span;
    return true;
  } catch (error) {
    console.error('[TextHighlight] Fallback wrapping failed:', error);
    return false;
  }
}

function isSafeToWrap(range: Range): boolean {
  // Don't wrap if selection spans multiple block elements
  const startBlock = getBlockParent(range.startContainer);
  const endBlock = getBlockParent(range.endContainer);

  if (startBlock !== endBlock) {
    return false;
  }

  // Don't wrap inside interactive elements
  const container = range.commonAncestorContainer;
  const parent = container.nodeType === Node.ELEMENT_NODE
    ? container as Element
    : container.parentElement;

  if (!parent) return false;

  const interactive = parent.closest('a, button, input, textarea, select');
  if (interactive) {
    return false;
  }

  return true;
}

function getBlockParent(node: Node): Element | null {
  let current = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement;

  while (current) {
    const display = window.getComputedStyle(current).display;
    if (display === 'block' || display === 'flex' || display === 'grid') {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

// ============================================================================
// Range Serialization
// ============================================================================

function serializeRange(range: Range): TextPositionSelector | null {
  // Get the root text content
  const root = document.body;
  const textContent = root.textContent || '';

  // Calculate text position offsets
  const startOffset = getTextOffset(root, range.startContainer, range.startOffset);
  const endOffset = getTextOffset(root, range.endContainer, range.endOffset);

  if (startOffset === null || endOffset === null) return null;

  return {
    type: 'TextPositionSelector',
    start: startOffset,
    end: endOffset,
    textContent: range.toString()
  };
}

function deserializeRange(selector: TextPositionSelector): Range | null {
  const root = document.body;
  const textContent = root.textContent || '';

  // Validate that text content matches
  const actualText = textContent.slice(selector.start, selector.end);
  if (actualText !== selector.textContent) {
    console.warn('[TextHighlight] Text content mismatch, page may have changed');
    // Try to find the text anyway
  }

  // Walk tree to find start and end nodes
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null
  );

  let currentOffset = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  let node: Text | null;

  while (node = walker.nextNode() as Text | null) {
    const length = node.textContent?.length || 0;

    if (!startNode && currentOffset + length > selector.start) {
      startNode = node;
      startOffset = selector.start - currentOffset;
    }

    if (!endNode && currentOffset + length >= selector.end) {
      endNode = node;
      endOffset = selector.end - currentOffset;
      break;
    }

    currentOffset += length;
  }

  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  return range;
}

function getTextOffset(
  root: Node,
  node: Node,
  offset: number
): number | null {
  // Handle case where node is an Element (not Text)
  // This happens when selecting entire element contents
  let targetNode: Node = node;
  let targetOffset = offset;

  if (node.nodeType === Node.ELEMENT_NODE) {
    // If it's an element node, find the actual text node
    console.log('[TextHighlight] Node is Element, converting to text node');
    const element = node as Element;
    if (offset < element.childNodes.length) {
      targetNode = element.childNodes[offset];
      targetOffset = 0;
    } else if (element.childNodes.length > 0) {
      // Use last child
      targetNode = element.childNodes[element.childNodes.length - 1];
      targetOffset = targetNode.textContent?.length || 0;
    } else if (element.firstChild) {
      targetNode = element.firstChild;
      targetOffset = offset;
    }
  }

  // Walk the tree and count text characters
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    null
  );

  let totalOffset = 0;
  let currentNode: Text | null;
  let nodeCount = 0;

  while (currentNode = walker.nextNode() as Text | null) {
    nodeCount++;
    if (currentNode === targetNode) {
      console.log('[TextHighlight] Found node at offset:', totalOffset + targetOffset, 'after', nodeCount, 'nodes');
      return totalOffset + targetOffset;
    }
    totalOffset += currentNode.textContent?.length || 0;
  }

  console.warn('[TextHighlight] Could not find node in tree walker. Checked', nodeCount, 'nodes');
  console.warn('[TextHighlight] Looking for:', targetNode.nodeName, targetNode.nodeValue?.substring(0, 20));
  console.warn('[TextHighlight] Original node:', node.nodeName, 'offset:', offset);
  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all active sessions
 */
export function getAllSessions(): TextSelectionSession[] {
  return Array.from(sessions.values());
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): TextSelectionSession | null {
  return sessions.get(sessionId) || null;
}

/**
 * Check if CSS Highlights API is supported
 */
export function isHighlightsAPISupported(): boolean {
  return supportsHighlightsAPI;
}
