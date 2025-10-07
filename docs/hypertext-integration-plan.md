# Hypertext System Integration Plan

## Executive Summary

This document outlines a comprehensive plan to integrate key design patterns and features from the NabokovsWeb-hypertext-module into the main NabokovsWeb extension's element chat system. The goal is to enhance the chat experience with better context handling, visual feedback, hover interactions, and nested conversation support.

## Analysis Summary

Based on thorough analysis of `../NabokovsWeb-hypertext-module/`, the hypertext system excels in:

1. **Sophisticated context management** with customizable providers
2. **Multi-level nested annotations** (up to 5 levels deep)
3. **Rich visual state indicators** (5 distinct color-coded states)
4. **Smart hover behavior** with auto-close and pin functionality
5. **Clear processing state visualization** (streaming indicators, color changes)
6. **Robust keyboard event handling** with proper preventDefault usage

---

## Current State: Element Chat System

### Architecture Overview

**Files Involved:**
- `src/components/ElementChatWindow.tsx` - Main chat window component
- `src/services/elementChatService.ts` - Element selection and context capture
- `src/services/elementChatIndicatorService.ts` - Visual indicators on chatted elements
- `src/services/elementChatWindowManager.ts` - Window positioning and lifecycle
- `src/types/elementChat.ts` - Type definitions

### Current Features

✅ **Working Well:**
- Floating, draggable, resizable chat windows
- Element context capture (HTML + computed styles)
- Visual indicators (📝 icon) on chatted elements
- Window state persistence
- Collapse/expand functionality
- Save to canvas as note cards

⚠️ **Areas for Improvement:**
- Context handling is basic (just HTML + styles)
- No nested chat support
- Limited visual state feedback
- Hover behavior is basic (just shows indicator on hover)
- Processing states are minimal
- Keyboard handling could be improved

---

## Integration Priorities

### Priority 1: Visual State Indicators (High Impact, Low Complexity)

**Goal:** Implement color-coded visual states for chatted elements similar to hypertext pills.

**Hypertext Pattern:**
```css
.hx-highlight.loading { color: #6c6c6c; }           /* Gray during processing */
.hx-highlight.ready-inline { color: #8b0000; }      /* Dark red for responses */
.hx-highlight.ready-reference { color: #1a73e8; }   /* Blue for references */
.hx-highlight.error { color: #b22222; }             /* Bright red for errors */
```

**Implementation Plan:**

1. **Extend `elementChatIndicatorService.ts`:**
   ```typescript
   type ElementChatState =
     | 'idle'        // No chat yet (no indicator)
     | 'loading'     // Request in progress (gray)
     | 'active'      // Has conversation (dark red)
     | 'error'       // Error occurred (bright red)
     | 'collapsed';  // Window collapsed (blue)

   interface ElementIndicator {
     element: HTMLElement;
     state: ElementChatState;
     markerElement: HTMLElement;  // The 📝 icon
     sessionId: string;
   }
   ```

2. **Add state-specific styling:**
   ```typescript
   const STATE_COLORS = {
     loading: '#6c6c6c',
     active: '#8b0000',
     error: '#b22222',
     collapsed: '#1a73e8'
   };

   function updateIndicatorState(sessionId: string, state: ElementChatState) {
     const indicator = indicators.get(sessionId);
     if (!indicator) return;

     indicator.state = state;
     indicator.markerElement.style.color = STATE_COLORS[state];
     indicator.markerElement.setAttribute('aria-label', getStateLabel(state));
   }
   ```

3. **Integration points:**
   - Set to `'loading'` when chat request starts
   - Set to `'active'` when response received
   - Set to `'error'` on API errors
   - Set to `'collapsed'` when window is collapsed

**Testing:**
- Visual verification of color changes
- Accessibility check (aria-label updates)
- State persistence across page interactions

---

### Priority 2: Enhanced Hover Behavior (High Impact, Medium Complexity)

**Goal:** Implement smart hover-to-open chat with auto-close delay and pin functionality.

**Hypertext Pattern:**
```javascript
// Hover to open
wrapper.addEventListener('mouseenter', () => {
  openChat(session, { autoFocus: false });
});

// Smart auto-close (195ms delay)
wrapper.addEventListener('mouseleave', () => {
  scheduleTooltipClose(AUTO_CLOSE_DELAY_MS, session);
});

// Prevent close if:
// - Mouse over anchor element
// - Mouse over tooltip
// - Tooltip is pinned
// - User is dragging/resizing
```

**Implementation Plan:**

1. **Add auto-open on hover to indicators:**
   ```typescript
   // In elementChatIndicatorService.ts
   function addIndicatorToElement(
     element: HTMLElement,
     sessionId: string,
     options: { autoOpenOnHover?: boolean } = {}
   ) {
     const marker = createMarkerElement(sessionId);

     if (options.autoOpenOnHover !== false) {
       element.addEventListener('mouseenter', () => {
         elementChatWindowManager.openWindow(sessionId, { autoFocus: false });
       });

       element.addEventListener('mouseleave', () => {
         scheduleAutoClose(sessionId, AUTO_CLOSE_DELAY_MS);
       });
     }

     // ... rest of implementation
   }
   ```

2. **Add auto-close scheduling to window manager:**
   ```typescript
   // In elementChatWindowManager.ts
   const AUTO_CLOSE_DELAY_MS = 195; // Match hypertext timing
   const autoCloseTimers = new Map<string, number>();

   export function scheduleAutoClose(sessionId: string, delay = AUTO_CLOSE_DELAY_MS) {
     cancelAutoClose(sessionId);

     const window = windows.get(sessionId);
     if (!window || window.isPinned) return;

     const timer = window.setTimeout(() => {
       const element = window.targetElement;
       const windowEl = window.containerElement;

       // Don't close if mouse is over element or window
       if (element?.matches(':hover') || windowEl?.matches(':hover')) {
         return;
       }

       // Don't close if dragging or resizing
       if (windowEl?.classList.contains('dragging') ||
           windowEl?.classList.contains('resizing')) {
         return;
       }

       closeWindow(sessionId);
     }, delay);

     autoCloseTimers.set(sessionId, timer);
   }

   export function cancelAutoClose(sessionId: string) {
     const timer = autoCloseTimers.get(sessionId);
     if (timer) {
       clearTimeout(timer);
       autoCloseTimers.delete(sessionId);
     }
   }
   ```

3. **Add pin functionality to chat window:**
   ```typescript
   // In ElementChatWindow.tsx
   const [isPinned, setIsPinned] = useState(false);

   const handlePinToggle = () => {
     setIsPinned(!isPinned);
     if (!isPinned) {
       elementChatWindowManager.cancelAutoClose(sessionId);
     }
   };

   // Add pin button to header
   <button
     onClick={handlePinToggle}
     className="pin-button"
     aria-label={isPinned ? 'Unpin window' : 'Pin window'}
   >
     {isPinned ? '📌' : '📍'}
   </button>
   ```

4. **Prevent auto-close during interaction:**
   ```typescript
   // In ElementChatWindow.tsx
   const containerRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
     const container = containerRef.current;
     if (!container) return;

     const handleMouseEnter = () => {
       elementChatWindowManager.cancelAutoClose(sessionId);
     };

     const handleMouseLeave = () => {
       elementChatWindowManager.scheduleAutoClose(sessionId);
     };

     container.addEventListener('mouseenter', handleMouseEnter);
     container.addEventListener('mouseleave', handleMouseLeave);

     return () => {
       container.removeEventListener('mouseenter', handleMouseEnter);
       container.removeEventListener('mouseleave', handleMouseLeave);
     };
   }, [sessionId]);
   ```

**Testing:**
- E2E test: Hover over indicator → window opens
- E2E test: Move mouse away → window closes after 195ms
- E2E test: Pin window → doesn't auto-close
- E2E test: Mouse over window → cancels auto-close

---

### Priority 3: Enhanced Context Provider (Medium Impact, Medium Complexity)

**Goal:** Implement customizable context providers with truncation options.

**Hypertext Pattern:**
```javascript
function getContext(session) {
  if (typeof contextProvider === 'function') {
    try {
      const value = contextProvider(session, { truncateContext });
      if (typeof value === 'string' && value.trim().length) {
        return formatContextOutput(value);
      }
    } catch (error) {
      console.warn('[Hypertext] contextProvider threw an error:', error);
    }
  }
  return buildDefaultContext(doc, session, truncateContext);
}
```

**Implementation Plan:**

1. **Create context provider service:**
   ```typescript
   // src/services/elementChatContextProvider.ts

   export type ContextProviderFn = (
     session: ElementChatSession,
     options: ContextProviderOptions
   ) => string | Promise<string>;

   export interface ContextProviderOptions {
     truncateContext: boolean;
     maxContextLength: number;
     includePageText: boolean;
     includeElementAncestors: boolean;
   }

   const DEFAULT_OPTIONS: ContextProviderOptions = {
     truncateContext: true,
     maxContextLength: 200000,
     includePageText: true,
     includeElementAncestors: true
   };

   let customProvider: ContextProviderFn | null = null;

   export function setContextProvider(provider: ContextProviderFn) {
     customProvider = provider;
   }

   export async function getContext(
     session: ElementChatSession,
     options: Partial<ContextProviderOptions> = {}
   ): Promise<string> {
     const opts = { ...DEFAULT_OPTIONS, ...options };

     // Try custom provider first
     if (customProvider) {
       try {
         const result = await customProvider(session, opts);
         if (typeof result === 'string' && result.trim().length > 0) {
           return formatContext(result, opts);
         }
       } catch (error) {
         console.warn('[ElementChat] Custom context provider failed:', error);
       }
     }

     // Fall back to default context
     return buildDefaultContext(session, opts);
   }

   function buildDefaultContext(
     session: ElementChatSession,
     options: ContextProviderOptions
   ): string {
     const parts: string[] = [];

     // Page metadata
     parts.push(`URL: ${window.location.href}`);
     parts.push(`Title: ${document.title}`);

     // Full page text (if enabled)
     if (options.includePageText) {
       const pageText = document.body.innerText;
       parts.push(`\nPage Content:\n${pageText}`);
     }

     // Element context
     parts.push(`\nElement HTML:\n${session.elementHTML}`);

     // Ancestor context (if enabled)
     if (options.includeElementAncestors && session.element) {
       const ancestors = getAncestorContext(session.element);
       parts.push(`\nElement Ancestors:\n${ancestors}`);
     }

     // Computed styles
     if (session.computedStyles) {
       parts.push(`\nComputed Styles:\n${JSON.stringify(session.computedStyles, null, 2)}`);
     }

     return parts.join('\n');
   }

   function formatContext(context: string, options: ContextProviderOptions): string {
     if (!options.truncateContext) return context;

     if (context.length <= options.maxContextLength) return context;

     return context.slice(0, options.maxContextLength) + '\n\n[Context truncated...]';
   }

   function getAncestorContext(element: HTMLElement, levels = 3): string {
     const ancestors: string[] = [];
     let current = element.parentElement;
     let level = 0;

     while (current && level < levels) {
       const tag = current.tagName.toLowerCase();
       const id = current.id ? `#${current.id}` : '';
       const classes = current.className ? `.${current.className.split(' ').join('.')}` : '';
       ancestors.push(`${tag}${id}${classes}`);
       current = current.parentElement;
       level++;
     }

     return ancestors.join(' > ');
   }
   ```

2. **Add truncation toggle to chat window:**
   ```typescript
   // In ElementChatWindow.tsx
   const [truncateContext, setTruncateContext] = useState(true);

   const handleRegenerateWithFullContext = async () => {
     setTruncateContext(false);
     // Regenerate context with full page text
     const fullContext = await elementChatContextProvider.getContext(
       session,
       { truncateContext: false }
     );
     // Re-send with full context
     handleSend(lastUserMessage, fullContext);
   };

   // Add toggle button to chat UI
   <button onClick={() => setTruncateContext(!truncateContext)}>
     {truncateContext ? '📄 Full Context' : '📋 Truncated Context'}
   </button>
   ```

3. **Update elementChatService to use new context provider:**
   ```typescript
   // In elementChatService.ts
   import * as contextProvider from './elementChatContextProvider';

   export async function captureElementContext(
     element: HTMLElement
   ): Promise<ElementChatSession> {
     const session = {
       id: generateId(),
       element,
       elementHTML: element.outerHTML,
       computedStyles: captureComputedStyles(element),
       createdAt: Date.now()
     };

     // Get context using provider
     const context = await contextProvider.getContext(session);

     return {
       ...session,
       context
     };
   }
   ```

**Testing:**
- Unit test: Default context includes URL, title, page text, element HTML
- Unit test: Truncation limits context to maxContextLength
- Unit test: Custom provider overrides default context
- Unit test: Ancestor context extraction
- E2E test: Toggle truncation in chat window

---

### Priority 4: Streaming State Visualization (Medium Impact, Low Complexity)

**Goal:** Add visual feedback during streaming similar to hypertext's pink background.

**Hypertext Pattern:**
```css
.hx-chat-tooltip.is-streaming {
  background: rgba(255, 242, 238, 1);  /* Warm pink */
  border-color: rgba(177, 60, 60, 0.6);
  box-shadow: 0 18px 38px rgba(177, 60, 60, 0.15);
}

.hx-streaming-text {
  color: #b83c1f;
  font-weight: 500;
  font-style: italic;
}
```

**Implementation Plan:**

1. **Add streaming state to ElementChatWindow:**
   ```typescript
   // In ElementChatWindow.tsx
   const [isStreaming, setIsStreaming] = useState(false);

   const handleSend = async (message: string) => {
     setIsStreaming(true);

     try {
       // Stream response
       await streamChatResponse(sessionId, message, {
         onChunk: (chunk) => {
           // Update UI with chunk
         },
         onComplete: () => {
           setIsStreaming(false);
         },
         onError: (error) => {
           setIsStreaming(false);
         }
       });
     } catch (error) {
       setIsStreaming(false);
     }
   };
   ```

2. **Add streaming CSS:**
   ```typescript
   const chatWindowStyles = {
     base: css`
       background: #fffaf7;
       border: 1px solid rgba(177, 60, 60, 0.2);
       transition: all 0.3s ease;
     `,
     streaming: css`
       background: rgba(255, 242, 238, 1);
       border-color: rgba(177, 60, 60, 0.6);
       box-shadow: 0 18px 38px rgba(177, 60, 60, 0.15),
                   inset 0 0 0 1px rgba(177, 60, 60, 0.1);
     `
   };

   return (
     <div css={[chatWindowStyles.base, isStreaming && chatWindowStyles.streaming]}>
       {/* ... */}
     </div>
   );
   ```

3. **Add streaming indicator:**
   ```typescript
   {isStreaming && (
     <div css={css`
       color: #b83c1f;
       font-weight: 500;
       font-style: italic;
       padding: 8px 12px;
       border-bottom: 1px solid rgba(177, 60, 60, 0.2);
     `}>
       Generating response...
     </div>
   )}
   ```

4. **Disable send button during streaming:**
   ```typescript
   <button
     onClick={handleSend}
     disabled={isStreaming}
     css={css`
       opacity: ${isStreaming ? 0.5 : 1};
       cursor: ${isStreaming ? 'not-allowed' : 'pointer'};
     `}
   >
     Send
   </button>
   ```

**Testing:**
- Visual verification of streaming state
- Button disabled during streaming
- Streaming indicator appears
- State resets on completion/error

---

### Priority 5: Multi-Level Nested Chats (Low Priority, High Complexity)

**Goal:** Support nested element chats (chat within a chat window).

**Hypertext Pattern:**
```javascript
// Parent-child session tracking
const session = {
  parentSessionId: parentSession?.id || null,
  childSessionIds: new Set(),
  nestingLevel,
  parentWasPinned,
  targetZIndex
};

// Auto-pin parent when creating child
if (parentSession && !parentSession.isPinned) {
  parentSession.parentWasPinned = false;
  setSessionPinned(parentSession, true);
}

// Restore parent pin state when child closes
if (session.parentSessionId) {
  const parent = sessions.get(session.parentSessionId);
  if (parent && !session.parentWasPinned) {
    setSessionPinned(parent, false);
  }
}
```

**Implementation Plan:**

1. **Extend ElementChatSession type:**
   ```typescript
   // In types/elementChat.ts
   interface ElementChatSession {
     id: string;
     element: HTMLElement;
     elementHTML: string;
     context: string;
     conversation: Message[];

     // Nesting support
     parentSessionId?: string;
     childSessionIds: Set<string>;
     nestingLevel: number;
     parentWasPinned?: boolean;

     // Window state
     isPinned: boolean;
     zIndex: number;
     position: { x: number; y: number };
     size: { width: number; height: number };
   }
   ```

2. **Add nesting detection to elementChatService:**
   ```typescript
   // In elementChatService.ts
   const MAX_NESTING_LEVEL = 5;

   export function getParentSession(
     element: HTMLElement,
     allSessions: Map<string, ElementChatSession>
   ): ElementChatSession | null {
     // Walk up DOM to find parent chat window
     let current = element.parentElement;

     while (current) {
       // Check if we're inside a chat window
       const chatWindow = current.closest('.element-chat-window');
       if (!chatWindow) {
         current = current.parentElement;
         continue;
       }

       // Find session for this window
       const sessionId = chatWindow.dataset.sessionId;
       if (sessionId) {
         const session = allSessions.get(sessionId);
         if (session && session.nestingLevel < MAX_NESTING_LEVEL) {
           return session;
         }
       }

       current = current.parentElement;
     }

     return null;
   }

   export function createNestedSession(
     element: HTMLElement,
     parentSession: ElementChatSession
   ): ElementChatSession {
     const session: ElementChatSession = {
       id: generateId(),
       element,
       elementHTML: element.outerHTML,
       context: '', // Will be populated
       conversation: [],

       // Nesting
       parentSessionId: parentSession.id,
       childSessionIds: new Set(),
       nestingLevel: parentSession.nestingLevel + 1,

       // Window state
       isPinned: false,
       zIndex: parentSession.zIndex + 1,
       position: calculateChildPosition(parentSession),
       size: { width: 400, height: 500 }
     };

     // Add to parent's children
     parentSession.childSessionIds.add(session.id);

     // Auto-pin parent if not already pinned
     if (!parentSession.isPinned) {
       session.parentWasPinned = false;
       parentSession.isPinned = true;
     } else {
       session.parentWasPinned = true;
     }

     return session;
   }

   function calculateChildPosition(
     parentSession: ElementChatSession
   ): { x: number; y: number } {
     // Offset child window from parent
     return {
       x: parentSession.position.x + 50,
       y: parentSession.position.y + 50
     };
   }
   ```

3. **Update window manager to handle nesting:**
   ```typescript
   // In elementChatWindowManager.ts
   export function openNestedWindow(
     element: HTMLElement,
     parentSessionId: string
   ) {
     const parentSession = sessions.get(parentSessionId);
     if (!parentSession) {
       console.error('[WindowManager] Parent session not found');
       return;
     }

     if (parentSession.nestingLevel >= MAX_NESTING_LEVEL) {
       console.warn('[WindowManager] Maximum nesting level reached');
       return;
     }

     const session = elementChatService.createNestedSession(element, parentSession);
     sessions.set(session.id, session);

     // Render window
     renderWindow(session);
   }

   export function closeWindow(sessionId: string) {
     const session = sessions.get(sessionId);
     if (!session) return;

     // Close all children first
     session.childSessionIds.forEach(childId => {
       closeWindow(childId);
     });

     // Restore parent pin state if applicable
     if (session.parentSessionId) {
       const parent = sessions.get(session.parentSessionId);
       if (parent && !session.parentWasPinned) {
         parent.isPinned = false;
       }

       // Remove from parent's children
       parent?.childSessionIds.delete(sessionId);
     }

     // Remove window
     const window = windows.get(sessionId);
     window?.remove();
     windows.delete(sessionId);
     sessions.delete(sessionId);
   }
   ```

4. **Add visual nesting indicators:**
   ```typescript
   // In ElementChatWindow.tsx
   const nestingColors = [
     '#b1403c',  // Level 0 (root)
     '#c15642',  // Level 1
     '#d16c48',  // Level 2
     '#e1824e',  // Level 3
     '#f19854'   // Level 4
   ];

   const headerColor = nestingColors[Math.min(nestingLevel, 4)];

   <div
     className="chat-header"
     css={css`
       background: linear-gradient(135deg, ${headerColor}, ${adjustBrightness(headerColor, -10)});
     `}
   >
     {nestingLevel > 0 && (
       <span className="nesting-badge">
         Level {nestingLevel}
       </span>
     )}
     {/* ... */}
   </div>
   ```

**Testing:**
- E2E test: Select text in chat window → creates nested chat
- E2E test: Parent auto-pins when child opens
- E2E test: Parent pin state restores when child closes
- E2E test: Maximum nesting level enforced
- E2E test: Closing parent closes all children

---

### Priority 6: Improved Keyboard Handling (Low Impact, Low Complexity)

**Goal:** Prevent webpage shortcuts from triggering when typing in chat.

**Hypertext Pattern:**
```javascript
const inputKeydownHandler = event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
};

inputEl?.addEventListener('keydown', inputKeydownHandler);
```

**Implementation Plan:**

1. **Add preventDefault to Enter key:**
   ```typescript
   // In ElementChatWindow.tsx
   const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
     if (e.key === 'Enter' && !e.shiftKey) {
       e.preventDefault();
       handleSend();
     }
   };

   <textarea
     value={input}
     onChange={(e) => setInput(e.target.value)}
     onKeyDown={handleKeyDown}
     placeholder="Type your message..."
   />
   ```

2. **Add Escape key to close window:**
   ```typescript
   useEffect(() => {
     const handleEscape = (e: KeyboardEvent) => {
       if (e.key === 'Escape') {
         onClose();
       }
     };

     window.addEventListener('keydown', handleEscape);
     return () => window.removeEventListener('keydown', handleEscape);
   }, [onClose]);
   ```

3. **Stop propagation for all keyboard events in chat:**
   ```typescript
   const handleContainerKeyDown = (e: React.KeyboardEvent) => {
     // Prevent webpage shortcuts while typing in chat
     e.stopPropagation();
   };

   <div
     className="chat-window"
     onKeyDown={handleContainerKeyDown}
   >
     {/* ... */}
   </div>
   ```

**Testing:**
- Manual test: Type shortcut keys in chat → page shortcuts don't trigger
- E2E test: Enter sends message (not newline)
- E2E test: Shift+Enter adds newline
- E2E test: Escape closes window

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)

**Priority 1 + Priority 4:**
1. Visual state indicators
2. Streaming state visualization

**Benefits:**
- Immediate UX improvement
- Low complexity, high visibility
- No breaking changes

**Deliverables:**
- Color-coded element indicators
- Streaming state CSS
- Updated types

### Phase 2: Enhanced Interactions (2-3 days)

**Priority 2 + Priority 6:**
1. Hover-to-open behavior
2. Auto-close with pin functionality
3. Improved keyboard handling

**Benefits:**
- Much smoother UX
- Reduces cognitive load
- Professional feel

**Deliverables:**
- Auto-open on hover
- Pin button
- Auto-close scheduling
- Keyboard event handling

### Phase 3: Advanced Context (3-4 days)

**Priority 3:**
1. Customizable context providers
2. Truncation options
3. Ancestor context extraction

**Benefits:**
- More relevant LLM responses
- Flexible for different use cases
- Better token efficiency

**Deliverables:**
- Context provider service
- Truncation toggle UI
- Ancestor context extraction
- Documentation

### Phase 4: Nested Chats (5-7 days)

**Priority 5:**
1. Multi-level session tracking
2. Parent-child relationships
3. Z-index management
4. Visual nesting indicators

**Benefits:**
- Powerful exploration tool
- Unique feature
- Complex interactions

**Deliverables:**
- Nesting detection
- Parent-child session management
- Visual indicators
- E2E tests

---

## Testing Strategy

### Unit Tests

**New Services:**
- `elementChatContextProvider.test.ts` (Priority 3)
  - Test default context building
  - Test custom provider override
  - Test truncation logic
  - Test ancestor extraction

**Updated Services:**
- `elementChatIndicatorService.test.ts` (Priority 1)
  - Test state transitions
  - Test color application
  - Test aria-label updates

- `elementChatWindowManager.test.ts` (Priority 2, 5)
  - Test auto-close scheduling
  - Test pin functionality
  - Test nesting logic
  - Test z-index management

### E2E Tests

**New Test File: `element-chat-enhancements.spec.ts`**

```typescript
test.describe('Element Chat Enhancements', () => {
  test.describe('Visual State Indicators', () => {
    test('should show gray indicator during loading', async ({ page }) => {
      // Test loading state color
    });

    test('should show red indicator when active', async ({ page }) => {
      // Test active state color
    });

    test('should show error indicator on failure', async ({ page }) => {
      // Test error state
    });
  });

  test.describe('Hover Behavior', () => {
    test('should open chat on hover', async ({ page }) => {
      // Test hover-to-open
    });

    test('should auto-close after 195ms', async ({ page }) => {
      // Test auto-close timing
    });

    test('should cancel close if mouse re-enters', async ({ page }) => {
      // Test cancel logic
    });

    test('should not close if pinned', async ({ page }) => {
      // Test pin functionality
    });
  });

  test.describe('Streaming Visualization', () => {
    test('should show pink background during streaming', async ({ page }) => {
      // Test streaming CSS
    });

    test('should disable send button during streaming', async ({ page }) => {
      // Test button state
    });
  });

  test.describe('Enhanced Context', () => {
    test('should include full page text by default', async ({ page }) => {
      // Test default context
    });

    test('should truncate long context', async ({ page }) => {
      // Test truncation
    });

    test('should toggle truncation', async ({ page }) => {
      // Test UI toggle
    });
  });

  test.describe('Nested Chats', () => {
    test('should create nested chat from selection in window', async ({ page }) => {
      // Test nesting
    });

    test('should auto-pin parent when child opens', async ({ page }) => {
      // Test auto-pin
    });

    test('should restore parent pin state when child closes', async ({ page }) => {
      // Test pin restoration
    });

    test('should enforce maximum nesting level', async ({ page }) => {
      // Test max depth
    });
  });

  test.describe('Keyboard Handling', () => {
    test('should prevent page shortcuts in chat', async ({ page }) => {
      // Test stopPropagation
    });

    test('should send message on Enter', async ({ page }) => {
      // Test Enter key
    });

    test('should insert newline on Shift+Enter', async ({ page }) => {
      // Test Shift+Enter
    });

    test('should close window on Escape', async ({ page }) => {
      // Test Escape key
    });
  });
});
```

### Manual Testing Checklist

**Phase 1:**
- [ ] Visual indicators appear with correct colors
- [ ] Streaming state changes window appearance
- [ ] No console errors
- [ ] Accessibility (screen reader announces states)

**Phase 2:**
- [ ] Hover over indicator opens chat smoothly
- [ ] Moving mouse away closes chat after delay
- [ ] Pin button prevents auto-close
- [ ] Keyboard shortcuts don't conflict with page

**Phase 3:**
- [ ] Context includes page text and element HTML
- [ ] Truncation toggle works
- [ ] Custom context provider can be set
- [ ] LLM responses are more relevant

**Phase 4:**
- [ ] Nested chats open at correct position
- [ ] Visual hierarchy is clear (colors/badges)
- [ ] Parent auto-pins when child opens
- [ ] Closing parent closes all children

---

## Migration Strategy

### Backwards Compatibility

**Ensure existing element chats continue to work:**

1. **Type extensions (not replacements):**
   ```typescript
   // Old type still valid
   interface ElementChatSession {
     id: string;
     element: HTMLElement;
     // ...existing fields
   }

   // New fields are optional
   interface ElementChatSession {
     // ...existing fields

     // NEW: Optional enhancements
     parentSessionId?: string;
     childSessionIds?: Set<string>;
     nestingLevel?: number;
     isPinned?: boolean;
   }
   ```

2. **Feature flags for gradual rollout:**
   ```typescript
   // src/config/featureFlags.ts
   export const ELEMENT_CHAT_FEATURES = {
     colorCodedIndicators: true,
     hoverToOpen: true,
     autoClose: true,
     pinFunctionality: true,
     streamingVisualization: true,
     enhancedContext: false,  // Disabled until Phase 3
     nestedChats: false        // Disabled until Phase 4
   };
   ```

3. **Graceful degradation:**
   - If enhanced context provider fails, fall back to basic context
   - If nesting not supported, create independent chat
   - If auto-close disabled, show close button prominently

### Data Migration

**No storage migration needed:**
- Element chat sessions are not persisted to chrome.storage
- All state is in-memory (similar to hypertext system)
- No backwards compatibility issues with stored data

---

## Open Questions & Decisions Needed

### 1. Context Truncation Strategy

**Question:** Should we truncate by default or let users opt-in?

**Options:**
- A) Truncate by default (better performance, token efficiency)
- B) Full context by default (better responses, higher cost)
- C) Smart truncation (detect page size, truncate only if > 200KB)

**Recommendation:** **Option C** - Smart truncation with UI indicator when truncated

---

### 2. Auto-Open Behavior

**Question:** Should element indicators auto-open chat on hover by default?

**Pros:**
- Faster access to chat
- Matches hypertext UX
- Reduces clicks

**Cons:**
- Could be annoying if accidental hovers
- Might interfere with reading
- Not expected behavior for traditional chat

**Recommendation:** **Enable by default, add global setting to disable**

---

### 3. Maximum Nesting Level

**Question:** What should the maximum nesting level be?

**Hypertext uses 5 levels.**

**Considerations:**
- UI complexity increases with nesting
- Z-index management gets tricky
- Memory usage scales with nested sessions

**Recommendation:** **Start with 3 levels, increase if needed**

---

### 4. Visual Design Consistency

**Question:** Should we exactly match hypertext's visual design or adapt to NabokovsWeb's aesthetic?

**NabokovsWeb uses:**
- Chinese aesthetic (red/gold gradients)
- Multi-layer shadows
- Warm color palette

**Hypertext uses:**
- Cooler color palette (blues, grays)
- Simpler shadows
- More minimal design

**Recommendation:** **Adapt hypertext patterns to NabokovsWeb's visual language:**
- Keep color-coded states but use NabokovsWeb's palette:
  - Loading: Gray (#6c6c6c) ✓ Keep
  - Active: Dark red (#8b0000) → Adjust to #b1403c (matches CardNode)
  - Error: Bright red (#b22222) ✓ Keep
  - Collapsed: Blue (#1a73e8) → Adjust to gold (#d4a259)
- Streaming state: Use NabokovsWeb's warm gradients instead of pink

---

## Success Metrics

### Quantitative Metrics

1. **Interaction Speed:**
   - Time to open chat: Target < 100ms (hover-to-open)
   - Time to close chat: 195ms (auto-close delay)

2. **Code Quality:**
   - Test coverage: > 80% for new services
   - Zero TypeScript errors
   - Zero console warnings in production

3. **Performance:**
   - No memory leaks (verify with Chrome DevTools)
   - Nested chats don't degrade performance
   - Context truncation reduces LLM token usage by 30-50%

### Qualitative Metrics

1. **User Experience:**
   - Visual states provide clear feedback
   - Hover behavior feels natural
   - Nested chats enable deeper exploration
   - Keyboard shortcuts work intuitively

2. **Developer Experience:**
   - Context provider API is easy to customize
   - Services are well-documented
   - New features don't break existing functionality

---

## Next Steps

### Immediate Actions

1. **Review this plan** with stakeholders
2. **Answer open questions** (see section above)
3. **Create GitHub issues** for each phase
4. **Set up feature flags** in codebase
5. **Create test plan** spreadsheet

### Phase 1 Kickoff (Ready to Start)

**Tasks:**
1. Create `docs/hypertext-integration-plan.md` (this document) ✅
2. Add feature flags to `src/config/featureFlags.ts`
3. Extend `ElementChatState` type
4. Implement color-coded indicators
5. Add streaming visualization CSS
6. Write unit tests
7. Write E2E tests
8. Update CLAUDE.md

**Estimated Timeline:** 1-2 days

---

## References

### Hypertext Module Files Analyzed

- `/Users/wz/Desktop/zPersonalProjects/NabokovsWeb-hypertext-module/hypertext/hypertext-experience.js` (main implementation)
- `/Users/wz/Desktop/zPersonalProjects/NabokovsWeb-hypertext-module/extension/hypertext-loader.js` (extension integration)
- `/Users/wz/Desktop/zPersonalProjects/NabokovsWeb-hypertext-module/extension/background.js` (keyboard shortcuts)

### NabokovsWeb Files to Modify

**Phase 1:**
- `src/types/elementChat.ts`
- `src/services/elementChatIndicatorService.ts`
- `src/components/ElementChatWindow.tsx`

**Phase 2:**
- `src/services/elementChatWindowManager.ts`
- `src/components/ElementChatWindow.tsx`

**Phase 3:**
- `src/services/elementChatContextProvider.ts` (NEW)
- `src/services/elementChatService.ts`
- `src/components/ElementChatWindow.tsx`

**Phase 4:**
- `src/types/elementChat.ts`
- `src/services/elementChatService.ts`
- `src/services/elementChatWindowManager.ts`
- `src/components/ElementChatWindow.tsx`

---

## Conclusion

This integration plan provides a **structured, phased approach** to incorporating the best features from the hypertext system into NabokovsWeb's element chat. By prioritizing high-impact, low-complexity features first (visual states, streaming visualization), we can deliver immediate value while building toward more complex features (nested chats).

The plan emphasizes:
- **Backwards compatibility** (no breaking changes)
- **Progressive enhancement** (features can be enabled incrementally)
- **Comprehensive testing** (unit + E2E tests for all new features)
- **Visual consistency** (adapt to NabokovsWeb's aesthetic)
- **User experience** (smoother interactions, clearer feedback)

**Next:** Review open questions, set priorities, and begin Phase 1 implementation.
