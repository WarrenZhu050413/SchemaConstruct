import type { ElementChatSession } from '@/types/elementChat';
import type { ElementDescriptor } from './elementIdService';
import { findElementByDescriptor } from './elementIdService';

interface IndicatorEntry {
  key: string;
  chatId: string;
  descriptor: ElementDescriptor;
  badge: HTMLSpanElement;
  element: HTMLElement | null;
}

const INDICATOR_ATTRIBUTE = 'data-nabokov-chat-indicator';
const POST_CHAT_INDICATOR_ATTRIBUTE = 'data-nabokov-post-chat-indicator';
const INDICATOR_SIZE = { width: 12, height: 12 };
const POST_CHAT_INDICATOR_SIZE = { width: 30, height: 30 };

const STATE_COLORS = {
  loading: '#6c6c6c',
  active: '#b1403c',
  error: '#b22222',
  collapsed: '#d4a259'
};

const indicators = new Map<string, IndicatorEntry>();
const postChatIndicators = new Map<string, HTMLElement>();
const hiddenChats = new Set<string>();
let mutationObserver: MutationObserver | null = null;
let rafHandle: number | null = null;
let initialized = false;

const scheduleRefresh = () => {
  if (rafHandle !== null) {
    return;
  }

  rafHandle = window.requestAnimationFrame(() => {
    rafHandle = null;
    refreshIndicators();
  });
};

const ensureInitialized = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  window.addEventListener('scroll', scheduleRefresh, true);
  window.addEventListener('resize', scheduleRefresh);

  mutationObserver = new MutationObserver(scheduleRefresh);
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });
};

const createBadge = (chatId: string): HTMLSpanElement => {
  const badge = document.createElement('span');
  badge.setAttribute(INDICATOR_ATTRIBUTE, chatId);
  badge.style.position = 'absolute';
  badge.style.width = `${INDICATOR_SIZE.width}px`;
  badge.style.height = `${INDICATOR_SIZE.height}px`;
  badge.style.borderRadius = '50%';
  badge.style.background = '#C23B22';
  badge.style.boxShadow = '0 0 6px rgba(194, 59, 34, 0.45)';
  badge.style.border = '2px solid rgba(255, 255, 255, 0.9)';
  badge.style.pointerEvents = 'none';
  badge.style.zIndex = '2147483646';
  badge.style.transform = 'translate(-50%, -50%)';
  badge.style.transition = 'opacity 0.2s ease';
  badge.style.opacity = '0';
  badge.style.display = 'none';
  badge.setAttribute('aria-hidden', 'true');
  badge.title = 'Saved element chat available';
  document.body.appendChild(badge);
  return badge;
};

const createPostChatIndicator = (
  element: HTMLElement,
  sessionId: string,
  state: keyof typeof STATE_COLORS = 'active'
): HTMLElement => {
  const indicator = document.createElement('div');
  indicator.setAttribute(POST_CHAT_INDICATOR_ATTRIBUTE, sessionId);
  indicator.dataset.sessionId = sessionId;

  Object.assign(indicator.style, {
    position: 'absolute',
    width: `${POST_CHAT_INDICATOR_SIZE.width}px`,
    height: `${POST_CHAT_INDICATOR_SIZE.height}px`,
    backgroundColor: STATE_COLORS[state],
    borderRadius: '4px',
    border: '2px solid #d4a259',
    boxShadow: '0 2px 8px rgba(177, 64, 60, 0.3)',
    cursor: 'pointer',
    zIndex: '9999',
    transition: 'all 0.2s ease',
    pointerEvents: 'auto'
  });

  // Position at top-right of element
  const rect = element.getBoundingClientRect();
  const top = rect.top + window.scrollY + 4;
  const left = rect.right + window.scrollX - 4;
  indicator.style.left = `${left}px`;
  indicator.style.top = `${top}px`;

  // Hover effect
  indicator.addEventListener('mouseenter', () => {
    indicator.style.transform = 'scale(1.1)';
  });

  indicator.addEventListener('mouseleave', () => {
    indicator.style.transform = 'scale(1)';
  });

  document.body.appendChild(indicator);
  return indicator;
};

const getDescriptorKey = (chatId: string, descriptor: ElementDescriptor): string => {
  return `${chatId}::${descriptor.chatId}`;
};

const positionBadge = (entry: IndicatorEntry): void => {
  if (hiddenChats.has(entry.chatId)) {
    entry.badge.style.display = 'none';
    entry.badge.style.opacity = '0';
    return;
  }

  let element = entry.element;

  if (!element || !document.contains(element)) {
    element = findElementByDescriptor(entry.descriptor);
    entry.element = element;
  }

  if (!element) {
    entry.badge.style.display = 'none';
    entry.badge.style.opacity = '0';
    return;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    entry.badge.style.display = 'none';
    entry.badge.style.opacity = '0';
    return;
  }

  const top = rect.top + window.scrollY + 4;
  const left = rect.right + window.scrollX - 4;

  entry.badge.style.left = `${left}px`;
  entry.badge.style.top = `${top}px`;
  entry.badge.style.display = 'block';
  entry.badge.style.opacity = '1';
};

const refreshIndicators = (): void => {
  indicators.forEach((entry) => {
    positionBadge(entry);
  });
};

const removeIndicatorByKey = (key: string): void => {
  const entry = indicators.get(key);
  if (!entry) {
    return;
  }

  if (entry.badge.parentNode) {
    entry.badge.parentNode.removeChild(entry.badge);
  }
  hiddenChats.delete(entry.chatId);
  indicators.delete(key);
};

export const initElementChatIndicators = (): void => {
  ensureInitialized();
  scheduleRefresh();
};

export const syncIndicatorsForSessions = (sessions: ElementChatSession[]): void => {
  ensureInitialized();

  const activeKeys = new Set<string>();

  sessions.forEach((session) => {
    const descriptors = session.elementDescriptors && session.elementDescriptors.length > 0
      ? session.elementDescriptors
      : session.elementDescriptor
        ? [session.elementDescriptor]
        : [];

    descriptors.forEach((descriptor) => {
      if (!descriptor) {
        return;
      }
      const key = getDescriptorKey(session.elementId, descriptor);
      activeKeys.add(key);

      let entry = indicators.get(key);
      if (!entry) {
        const badge = createBadge(session.elementId);
        entry = {
          key,
          chatId: session.elementId,
          descriptor,
          badge,
          element: null,
        };
        indicators.set(key, entry);
      } else {
        entry.descriptor = descriptor;
      }
    });
  });

  Array.from(indicators.keys()).forEach((key) => {
    if (!activeKeys.has(key)) {
      removeIndicatorByKey(key);
    }
  });

  scheduleRefresh();
};

export const upsertIndicatorsForSession = (session: ElementChatSession): void => {
  ensureInitialized();

  const descriptors = session.elementDescriptors && session.elementDescriptors.length > 0
    ? session.elementDescriptors
    : session.elementDescriptor
      ? [session.elementDescriptor]
      : [];

  const seenKeys = new Set<string>();

  descriptors.forEach((descriptor) => {
    if (!descriptor) {
      return;
    }

    const key = getDescriptorKey(session.elementId, descriptor);
    seenKeys.add(key);
    let entry = indicators.get(key);
    if (!entry) {
      entry = {
        key,
        chatId: session.elementId,
        descriptor,
        badge: createBadge(session.elementId),
        element: null,
      };
      indicators.set(key, entry);
    } else {
      entry.descriptor = descriptor;
    }
  });

  Array.from(indicators.values()).forEach((entry) => {
    if (entry.chatId === session.elementId && !seenKeys.has(entry.key)) {
      removeIndicatorByKey(entry.key);
    }
  });

  scheduleRefresh();
};

export const removeIndicatorsForChat = (chatId: string): void => {
  Array.from(indicators.values()).forEach((entry) => {
    if (entry.chatId === chatId) {
      removeIndicatorByKey(entry.key);
    }
  });
  hiddenChats.delete(chatId);
};

export const hideIndicatorsForChat = (chatId: string): void => {
  hiddenChats.add(chatId);
  Array.from(indicators.values()).forEach((entry) => {
    if (entry.chatId === chatId) {
      entry.badge.style.display = 'none';
      entry.badge.style.opacity = '0';
    }
  });
  scheduleRefresh();
};

export const showIndicatorsForChat = (chatId: string): void => {
  if (!hiddenChats.has(chatId)) {
    scheduleRefresh();
    return;
  }

  hiddenChats.delete(chatId);
  scheduleRefresh();
};

export const teardownElementChatIndicators = (): void => {
  if (!initialized) {
    return;
  }

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }

  window.removeEventListener('scroll', scheduleRefresh, true);
  window.removeEventListener('resize', scheduleRefresh);

  indicators.forEach((entry) => {
    if (entry.badge.parentNode) {
      entry.badge.parentNode.removeChild(entry.badge);
    }
  });
  indicators.clear();

  postChatIndicators.forEach((indicator) => {
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  });
  postChatIndicators.clear();

  initialized = false;
};

/**
 * Show a post-chat indicator for a closed chat session
 */
export const showPostChatIndicator = (
  element: HTMLElement,
  sessionId: string,
  state: keyof typeof STATE_COLORS = 'active',
  onReopen?: (sessionId: string) => void
): void => {
  ensureInitialized();

  // Remove existing indicator if present
  const existing = postChatIndicators.get(sessionId);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  // Create new indicator
  const indicator = createPostChatIndicator(element, sessionId, state);

  // Add click handler to reopen
  if (onReopen) {
    indicator.addEventListener('click', () => {
      onReopen(sessionId);
    });
  }

  postChatIndicators.set(sessionId, indicator);

  // Update position on scroll/resize
  const updatePosition = () => {
    if (!document.contains(element)) {
      removePostChatIndicator(sessionId);
      return;
    }
    const rect = element.getBoundingClientRect();
    const top = rect.top + window.scrollY + 4;
    const left = rect.right + window.scrollX - 4;
    indicator.style.left = `${left}px`;
    indicator.style.top = `${top}px`;
  };

  // Store update function on indicator for cleanup
  (indicator as any).__updatePosition = updatePosition;

  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);
};

/**
 * Update post-chat indicator state (color)
 */
export const updatePostChatIndicatorState = (
  sessionId: string,
  state: keyof typeof STATE_COLORS
): void => {
  const indicator = postChatIndicators.get(sessionId);
  if (indicator) {
    indicator.style.backgroundColor = STATE_COLORS[state];
  }
};

/**
 * Remove a post-chat indicator
 */
export const removePostChatIndicator = (sessionId: string): void => {
  const indicator = postChatIndicators.get(sessionId);
  if (!indicator) {
    return;
  }

  // Remove event listeners
  const updatePosition = (indicator as any).__updatePosition;
  if (updatePosition) {
    window.removeEventListener('scroll', updatePosition, true);
    window.removeEventListener('resize', updatePosition);
  }

  if (indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
  }

  postChatIndicators.delete(sessionId);
};
