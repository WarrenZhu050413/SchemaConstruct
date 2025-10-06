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
const indicators = new Map<string, IndicatorEntry>();
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
  badge.style.width = '12px';
  badge.style.height = '12px';
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

const getDescriptorKey = (chatId: string, descriptor: ElementDescriptor): string => {
  return `${chatId}::${descriptor.chatId}`;
};

const positionBadge = (entry: IndicatorEntry): void => {
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

  initialized = false;
};
