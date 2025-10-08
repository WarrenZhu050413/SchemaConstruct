/** @jsxImportSource @emotion/react */
/**
 * Element Chat Window
 *
 * Persistent chat window attached to a specific page element.
 * Automatically saves conversation history and window state.
 */

import { css } from '@emotion/react';
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { Rnd } from 'react-rnd';
import type { ElementChatSession, ChatMessage, CollapseState } from '@/types/elementChat';
import type { ElementDescriptor } from '@/services/elementIdService';
import type { Card } from '@/types/card';
import { ImageUploadZone } from '@/shared/components/ImageUpload/ImageUploadZone';
import { fileToBase64, getImageDimensions, isImageFile } from '@/utils/imageUpload';
import { findElementByDescriptor } from '@/services/elementIdService';
import { upsertIndicatorsForSession, removeIndicatorsForChat, hideIndicatorsForChat, showIndicatorsForChat, showPostChatIndicator, removePostChatIndicator } from '@/services/elementChatIndicatorService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type DuplicateTestConfig = {
  mockContent?: string;
  persist?: boolean;
  duplicate?: boolean;
};

let forceDevLogsFlag = false;
let duplicateTestConfig: DuplicateTestConfig | boolean | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }

    if (data.type === '__NABOKOV_FORCE_DEV_LOGS__') {
      forceDevLogsFlag = Boolean(data.enabled);
    }

    if (data.type === '__NABOKOV_TEST_FORCE_DUPLICATE__') {
      duplicateTestConfig = data.config ?? true;
    }

    if (data.type === '__NABOKOV_RESET_TEST_FORCE_DUPLICATE__') {
      duplicateTestConfig = null;
    }
  });
}

const ELEMENT_CHAT_THEME = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  containerBackground: '#FFF5F2',
  containerBackgroundGradient: 'linear-gradient(135deg, #FFF8F4 0%, #FFE9DD 100%)',
  containerAccent: '#B22222',
  containerShadow:
    '0 8px 32px rgba(139, 0, 0, 0.24), 0 0 0 1px rgba(210, 105, 30, 0.12)',
  headerGradient: 'linear-gradient(135deg, #8B0000, #C23B22)',
  headerTextColor: '#FFFFFF',
  headerInfoText: 'rgba(255, 246, 240, 0.85)',
  headerBadgeBackground: 'rgba(255, 255, 255, 0.22)',
  headerBadgeText: '#FFF5F2',
  iconColor: '#FFD700',
  selectedBannerBackground: 'linear-gradient(135deg, #FCE2D7, #FFE0B2)',
  selectedBannerBorder: '2px solid rgba(194, 59, 34, 0.25)',
  selectedBannerLabel: '#8B0000',
  selectedBannerContentBackground: '#FFF1EA',
  selectedBannerContentBorder: '#C23B22',
  messagesBackground: '#FFFFFF',
  messageUserBackground: '#FCE2D7',
  messageUserBorder: '#C23B22',
  messageAssistantBackground: '#FBE9C5',
  messageAssistantBorder: '#D8A447',
  messageRoleColor: '#8B0000',
  assistantRoleColor: '#B25C00',
  messageTextColor: '#2F1B1B',
  messageLinkColor: '#B22222',
  codeBackground: '#F6D0C5',
  preBackground: '#F9DDD1',
  queueBackground: '#FFF1EA',
  queueBorder: '#E6A38C',
  queueText: '#7A2F2F',
  queueAccent: '#C23B22',
  queueAccentSoft: '#F5C9B6',
  inputBorder: '#E6A38C',
  inputBackground: '#FFF8F4',
  inputFocus: '#C23B22',
  sendButtonGradient: 'linear-gradient(135deg, #8B0000, #C23B22)',
  sendButtonBorder: '#D96F5C',
  sendButtonShadow: '0 2px 8px rgba(139, 0, 0, 0.28)',
  imagePreviewBorder: '#E6A38C',
  anchorChipInactiveBg: 'rgba(194, 59, 34, 0.12)',
  anchorChipActiveBg: 'rgba(194, 59, 34, 0.2)',
  anchorChipBorder: 'rgba(194, 59, 34, 0.35)',
  indicatorDot: '#C23B22',
};

const ANCHOR_ALIGNMENT_NUDGE_PX = 32;

export interface ElementChatWindowProps {
  /** Element's chat ID */
  elementId: string;
  /** Element descriptors for positioning and context */
  elementDescriptors?: ElementDescriptor[];
  /** Primary element descriptor (fallback for legacy calls) */
  elementDescriptor?: ElementDescriptor;
  /** Existing chat session (if reopening) */
  existingSession?: ElementChatSession | null;
  /** Callback when window is closed */
  onClose: () => void;
  /** Initial position (if creating new window) */
  initialPosition?: { x: number; y: number };
  /** Selected text for text-contextual chat */
  selectedText?: string;
}

type PendingImage = {
  dataURL: string;
  width: number;
  height: number;
};

interface QueuedMessage {
  id: string;
  content: string;
  images?: PendingImage[];
  createdAt: number;
  messageId: string;
}

const buildDescriptorKey = (descriptor: ElementDescriptor, index: number): string => {
  const parts: string[] = [descriptor.chatId];

  if (descriptor.id) {
    parts.push(`id:${descriptor.id}`);
  } else if (descriptor.cssSelector) {
    parts.push(`css:${descriptor.cssSelector}`);
  } else if (descriptor.xpath) {
    parts.push(`xpath:${descriptor.xpath}`);
  } else {
    const rect = descriptor.boundingRect;
    parts.push(
      `rect:${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}:${Math.round(rect.height)}`
    );
    parts.push(`idx:${index}`);
  }

  return parts.join('|');
};

const resolveElementForDescriptor = (descriptor: ElementDescriptor): HTMLElement | null => {
  if (descriptor.id) {
    const byId = document.getElementById(descriptor.id);
    if (byId instanceof HTMLElement) {
      return byId;
    }
  }

  if (descriptor.cssSelector) {
    try {
      const bySelector = document.querySelector(descriptor.cssSelector);
      if (bySelector instanceof HTMLElement) {
        return bySelector;
      }
    } catch (error) {
      console.warn('[ElementChatWindow] Failed to query selector', descriptor.cssSelector, error);
    }
  }

  const chatMatches = document.querySelectorAll(`[data-nabokov-chat-id="${descriptor.chatId}"]`);
  if (chatMatches.length > 0) {
    if (chatMatches.length > 1) {
      for (const candidate of Array.from(chatMatches)) {
        if (!(candidate instanceof HTMLElement)) {
          continue;
        }
        const rect = candidate.getBoundingClientRect();
        const targetRect = descriptor.boundingRect;
        if (
          targetRect &&
          Math.abs(rect.top - targetRect.top) < 5 &&
          Math.abs(rect.left - targetRect.left) < 5
        ) {
          return candidate;
        }
      }
    }

    const fallback = chatMatches[0];
    if (fallback instanceof HTMLElement) {
      return fallback;
    }
  }

  return findElementByDescriptor(descriptor);
};

const dedupeMessagesById = (messages: ChatMessage[]): ChatMessage[] => {
  const seen = new Set<string>();
  const deduped: ChatMessage[] = [];

  for (const message of messages) {
    if (seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    deduped.push(message);
  }

  return deduped;
};

const normalizeNewlines = (value: string): string => value.replace(/\r\n/g, '\n');

const separateAssistantResponse = (
  fullContent: string,
  deltaHistory: string[]
): { answer: string; thinking?: string } => {
  const normalizedFull = normalizeNewlines(fullContent ?? '');
  const trimmedFull = normalizedFull.trim();

  if (!trimmedFull) {
    return { answer: '' };
  }

  const doubleBreakIndex = normalizedFull.indexOf('\n\n');
  if (doubleBreakIndex !== -1) {
    const thinkingCandidate = normalizedFull.slice(0, doubleBreakIndex).trim();
    const answerRaw = normalizedFull.slice(doubleBreakIndex + 2);
    const answerCandidate = answerRaw.replace(/^\s+/, '');

    if (thinkingCandidate && answerCandidate.trim().length > 0) {
      return {
        answer: answerCandidate,
        thinking: thinkingCandidate,
      };
    }
  }

  if (deltaHistory.length > 1) {
    const [firstChunk, ...restChunks] = deltaHistory.map(chunk => normalizeNewlines(chunk));
    const thinkingCandidate = (firstChunk || '').trim();
    const restCombinedRaw = restChunks.join('');
    const restCombinedNormalized = normalizeNewlines(restCombinedRaw);
    const answerCandidate = restCombinedNormalized.replace(/^\s+/, '');

    if (thinkingCandidate && answerCandidate.trim().length > 0) {
      return {
        answer: answerCandidate,
        thinking: thinkingCandidate,
      };
    }
  }

  return {
    answer: normalizedFull.replace(/^\s+/, ''),
  };
};

/**
 * ElementChatWindow Component
 */
export const ElementChatWindow: React.FC<ElementChatWindowProps> = ({
  elementId,
  elementDescriptors,
  elementDescriptor,
  existingSession,
  onClose,
  initialPosition,
  selectedText
}) => {
  const descriptorCandidates = useMemo(() => {
    if (existingSession?.elementDescriptors && existingSession.elementDescriptors.length > 0) {
      return existingSession.elementDescriptors;
    }
    if (elementDescriptors && elementDescriptors.length > 0) {
      return elementDescriptors;
    }
    if (existingSession?.elementDescriptor) {
      return [existingSession.elementDescriptor];
    }
    if (elementDescriptor) {
      return [elementDescriptor];
    }
    return [] as ElementDescriptor[];
  }, [existingSession, elementDescriptors, elementDescriptor]);

  const primaryDescriptor = descriptorCandidates[0];

  if (!primaryDescriptor) {
    console.error('[ElementChatWindow] Missing element descriptor for chat window');
    return null;
  }

  const descriptorList = useMemo(() => {
    if (descriptorCandidates.length === 0) {
      return [primaryDescriptor];
    }
    return descriptorCandidates;
  }, [descriptorCandidates, primaryDescriptor]);

  const descriptorEntries = useMemo(() => {
    return descriptorList.map((descriptor, index) => ({
      descriptor,
      index,
      key: buildDescriptorKey(descriptor, index)
    }));
  }, [descriptorList]);

  const descriptorMap = useMemo(() => {
    const map = new Map<string, ElementDescriptor>();
    descriptorEntries.forEach(({ key, descriptor }) => {
      map.set(key, descriptor);
    });
    return map;
  }, [descriptorEntries]);

  const descriptorKeyMap = useMemo(() => {
    const map = new Map<ElementDescriptor, string>();
    descriptorEntries.forEach(({ key, descriptor }) => {
      map.set(descriptor, key);
    });
    return map;
  }, [descriptorEntries]);

  const initialActiveAnchorKey = useMemo(() => {
    const sessionKey = existingSession?.windowState?.activeAnchorKey;
    if (sessionKey && descriptorEntries.some(entry => entry.key === sessionKey)) {
      return sessionKey;
    }

    const legacyChatId = existingSession?.windowState?.activeAnchorChatId;
    if (legacyChatId) {
      const match = descriptorEntries.find(entry => entry.descriptor.chatId === legacyChatId);
      if (match) {
        return match.key;
      }
    }

    return descriptorEntries[0]?.key ?? buildDescriptorKey(primaryDescriptor, 0);
  }, [descriptorEntries, existingSession, primaryDescriptor]);

  // Load initial messages from existing session
  const [messages, setMessages] = useState<ChatMessage[]>(
    existingSession?.messages || []
  );
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingDeltas, setStreamingDeltas] = useState<string[]>([]);
  const [expandedReasoningMap, setExpandedReasoningMap] = useState<Record<string, boolean>>({});
  const [collapseState, setCollapseState] = useState<CollapseState>(() => {
    if (existingSession?.windowState?.collapseState) {
      return existingSession.windowState.collapseState;
    }
    if (existingSession?.windowState?.collapsed) {
      return 'rectangle';
    }
    return 'expanded';
  });
  const [windowSize, setWindowSize] = useState(
    existingSession?.windowState?.size || { width: 420, height: 550 }
  );
  const [position, setPosition] = useState(
    existingSession?.windowState?.position || initialPosition || { x: 100, y: 100 }
  );
  const [anchorOffset, setAnchorOffset] = useState<{ x: number; y: number } | null>(
    existingSession?.windowState?.anchorOffset || null
  );
  const [queueExpanded, setQueueExpanded] = useState(
    existingSession?.windowState?.queueExpanded ?? false
  );
  const [clearPreviousAssistant, setClearPreviousAssistant] = useState(
    existingSession?.windowState?.clearPreviousAssistant ?? false
  );
  const [activeAnchorKey, setActiveAnchorKey] = useState(initialActiveAnchorKey);

  // Message queue for queueing messages sent during streaming
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [activeQueuedId, setActiveQueuedId] = useState<string | null>(null);
  const [anchorElementMissing, setAnchorElementMissing] = useState(false);

  // Image upload support
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const hostElementRef = useRef<HTMLElement | null>(null);
  const hostListenerAttachedRef = useRef(false);
  const hostCollapseHandlerRef = useRef<((event: Event) => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<ElementChatSession | null>(existingSession || null);
  const isMountedRef = useRef(true);
  const anchorElementRef = useRef<HTMLElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamingDeltasRef = useRef<HTMLDivElement | null>(null);
  const streamingDeltaHistoryRef = useRef<string[]>([]);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const positionRef = useRef(position);
  const ensureAnchorPositionRef = useRef<() => void>(() => {});
  const windowSizeRef = useRef(windowSize);
  const collapseStateRef = useRef<CollapseState>(collapseState);
  const anchorOffsetRef = useRef<{ x: number; y: number } | null>(anchorOffset);
  const anchorOffsetsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const queueExpandedRef = useRef(queueExpanded);
  const clearPreviousAssistantRef = useRef(clearPreviousAssistant);
  const messageQueueRef = useRef<QueuedMessage[]>(messageQueue);
  const isProcessingQueueRef = useRef(isProcessingQueue);
  const isDraggingRef = useRef(false);
  const processQueueRef = useRef<(() => void) | null>(null);
  const activeAnchorKeyRef = useRef(activeAnchorKey);
  const isSendingRef = useRef(false);
  const lastSubmittedMessageRef = useRef<{ signature: string; timestamp: number; messageId: string } | null>(null);
  const assistantTurnMapRef = useRef<Map<string, string>>(new Map());
  const alignmentFrameRef = useRef<number | null>(null);

  const applyStreamingSnapshot = (next: string[]) => {
    streamingDeltaHistoryRef.current = next;
    if (typeof window !== 'undefined') {
      (window as any).__NABOKOV_DEBUG_STREAMING_DELTAS__ = next;
    }
  };

  const resetStreamingSnapshot = (preserveHistory: boolean) => {
    if (typeof window !== 'undefined') {
      if (preserveHistory) {
        (window as any).__NABOKOV_DEBUG_LAST_DELTAS__ = [...streamingDeltaHistoryRef.current];
        if (streamingDeltasRef.current) {
          const computed = window.getComputedStyle(streamingDeltasRef.current);
          (window as any).__NABOKOV_DEBUG_STREAMING_STYLE__ = {
            overflowY: computed.overflowY,
            maxHeight: computed.maxHeight,
          };
        }
      } else if ((window as any).__NABOKOV_DEBUG_STREAMING_STYLE__) {
        delete (window as any).__NABOKOV_DEBUG_STREAMING_STYLE__;
      }
      (window as any).__NABOKOV_DEBUG_STREAMING_DELTAS__ = [];
    }
    streamingDeltaHistoryRef.current = [];
    setStreamingDeltas([]);
  };

  const toggleReasoningForMessage = useCallback((messageId: string) => {
    setExpandedReasoningMap(prev => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  }, []);

  const isDevLoggingEnabled = () => {
    if (import.meta.env?.DEV) {
      return true;
    }
    if (forceDevLogsFlag) {
      return true;
    }
    if (typeof window !== 'undefined') {
      return Boolean((window as any).__NABOKOV_FORCE_DEV_LOGS__);
    }
    return false;
  };

  const debugLog = (message: string, payload?: Record<string, unknown>) => {
    if (!isDevLoggingEnabled()) {
      return;
    }
    if (payload) {
      console.debug(message, payload);
    } else {
      console.debug(message);
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingDeltas]);

  useEffect(() => {
    const container = streamingDeltasRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [streamingDeltas]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (hostElementRef.current) {
        if (hostCollapseHandlerRef.current) {
          hostElementRef.current.removeEventListener('nabokov:test:set-collapse-state', hostCollapseHandlerRef.current as EventListener);
          hostListenerAttachedRef.current = false;
          hostCollapseHandlerRef.current = null;
        }
        hostElementRef.current.removeAttribute('data-collapse-state');
        hostElementRef.current.removeAttribute('data-processing');
        hostElementRef.current.removeAttribute('data-message-count');
        hostElementRef.current.removeAttribute('data-rectangle-icon');
        hostElementRef.current.removeAttribute('data-rectangle-title');
        hostElementRef.current.removeAttribute('data-square-icon');
        hostElementRef.current.removeAttribute('data-square-title');
        hostElementRef.current.removeAttribute('data-square-toggle-icon');
        hostElementRef.current.removeAttribute('data-square-toggle-title');
        hostElementRef.current.removeAttribute('data-rendered-width');
        hostElementRef.current.removeAttribute('data-rendered-height');
      }
    };
  }, []);

  useEffect(() => {
    hideIndicatorsForChat(elementId);
    return () => {
      showIndicatorsForChat(elementId);
    };
  }, [elementId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const nextMap = new Map<string, string>();
    for (const message of messages) {
      if (message.role === 'assistant' && message.turnId) {
        nextMap.set(message.turnId, message.id);
      }
    }
    assistantTurnMapRef.current = nextMap;
  }, [messages]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    windowSizeRef.current = windowSize;
  }, [windowSize]);

  useEffect(() => {
    collapseStateRef.current = collapseState;
  }, [collapseState]);

  const hasHistory = messages.length > 0;
  const isExpanded = collapseState === 'expanded';
  const isRectangleCollapsed = collapseState === 'rectangle';
  const isSquareCollapsed = collapseState === 'square';

  const squareSize = 100;

  // Calculate header-only height (header padding + content + border)
  const headerOnlyHeight = 44; // 10px top + 10px bottom padding + ~20px content + 4px border

  const updateHostMetadata = useCallback(() => {
    const host = hostElementRef.current;
    const container = rootContainerRef.current;
    if (!host || !container) {
      return;
    }

    const rectangleIcon = isRectangleCollapsed ? '⤢' : '▭';
    const rectangleTitle = isRectangleCollapsed ? 'Expand to full window' : 'Collapse to rectangle';
    const squareIcon = isSquareCollapsed ? '⤢' : '◼';
    const squareTitle = isSquareCollapsed ? 'Expand to full window' : 'Collapse to square';
    const squareToggleIcon = '💬';
    const squareToggleTitle = 'Expand chat';

    host.setAttribute('data-collapse-state', collapseState);
    host.setAttribute('data-processing', isStreaming ? 'true' : 'false');
    host.setAttribute('data-message-count', String(messages.length));
    host.setAttribute('data-rectangle-icon', rectangleIcon);
    host.setAttribute('data-rectangle-title', rectangleTitle);
    host.setAttribute('data-square-icon', squareIcon);
    host.setAttribute('data-square-title', squareTitle);
    host.setAttribute('data-square-toggle-icon', squareToggleIcon);
    host.setAttribute('data-square-toggle-title', squareToggleTitle);

    const rect = container.getBoundingClientRect();
    host.setAttribute('data-rendered-width', rect.width.toFixed(2));
    host.setAttribute('data-rendered-height', rect.height.toFixed(2));
  }, [collapseState, isRectangleCollapsed, isSquareCollapsed, isStreaming, messages.length]);

  const ensureTestListener = useCallback(() => {
    const host = hostElementRef.current;
    if (!host || hostListenerAttachedRef.current) {
      return;
    }

    const handleTestCollapse = (event: Event) => {
      const custom = event as CustomEvent<{ state: CollapseState }>;
      const nextState = custom.detail?.state;
      if (nextState && ['expanded', 'rectangle', 'square'].includes(nextState)) {
        setCollapseState(nextState as CollapseState);
      }
    };

    const handleForceAnchorUpdate = () => {
      ensureAnchorPositionRef.current();
    };

    host.addEventListener('nabokov:test:set-collapse-state', handleTestCollapse as EventListener);
    host.addEventListener('nabokov:test:force-anchor-update', handleForceAnchorUpdate as EventListener);
    hostListenerAttachedRef.current = true;
    hostCollapseHandlerRef.current = handleTestCollapse;

    host.addEventListener('nabokov:test:teardown', () => {
      host.removeEventListener('nabokov:test:set-collapse-state', handleTestCollapse as EventListener);
      host.removeEventListener('nabokov:test:force-anchor-update', handleForceAnchorUpdate as EventListener);
      hostListenerAttachedRef.current = false;
      hostCollapseHandlerRef.current = null;
    }, { once: true });
  }, [setCollapseState]);

  useEffect(() => {
    if (!rootContainerRef.current) {
      return;
    }
    const rootNode = rootContainerRef.current.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      hostElementRef.current = rootNode.host as HTMLElement;
      ensureTestListener();
      updateHostMetadata();
    }
  }, [ensureTestListener, updateHostMetadata]);

  useEffect(() => {
    if (hostElementRef.current) {
      return;
    }
    const host = document.querySelector<HTMLElement>(`[data-nabokov-element-chat="${elementId}"]`);
    if (host) {
      hostElementRef.current = host;
      ensureTestListener();
      updateHostMetadata();
    }
  }, [elementId, ensureTestListener, updateHostMetadata]);

  useEffect(() => {
    updateHostMetadata();
  }, [updateHostMetadata, windowSize.width, windowSize.height]);

  useEffect(() => {
    anchorOffsetRef.current = anchorOffset;
  }, [anchorOffset]);

  useEffect(() => {
    queueExpandedRef.current = queueExpanded;
  }, [queueExpanded]);

  useEffect(() => {
    clearPreviousAssistantRef.current = clearPreviousAssistant;
  }, [clearPreviousAssistant]);

  useEffect(() => {
    messageQueueRef.current = messageQueue;
  }, [messageQueue]);

  useEffect(() => {
    isProcessingQueueRef.current = isProcessingQueue;
  }, [isProcessingQueue]);

  useEffect(() => {
    setExpandedReasoningMap(prev => {
      const validIds = new Set(messages.map(message => message.id));
      let changed = false;
      const next: Record<string, boolean> = {};

      for (const [id, value] of Object.entries(prev)) {
        if (validIds.has(id)) {
          next[id] = value;
        } else {
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [messages]);

  const renderMarkdown = useCallback(
    (content: string) => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    ),
    []
  );

  useEffect(() => {
    activeAnchorKeyRef.current = activeAnchorKey;
  }, [activeAnchorKey]);

  useEffect(() => {
    if (!descriptorMap.has(activeAnchorKeyRef.current)) {
      setActiveAnchorKey(initialActiveAnchorKey);
      activeAnchorKeyRef.current = initialActiveAnchorKey;
    }
  }, [descriptorMap, initialActiveAnchorKey]);

  const ensureAnchorPosition = useCallback(() => {
    if (!isMountedRef.current) {
      return;
    }

    if (forceDevLogsFlag) {
      console.log('[ElementChatWindow] ensureAnchorPosition invoked ' + JSON.stringify({
        activeAnchorKey: activeAnchorKeyRef.current,
        hasOffset: Boolean(anchorOffsetRef.current),
        offset: anchorOffsetRef.current,
        position: positionRef.current,
      }));
    }

    const priorityDescriptors: ElementDescriptor[] = [];
    if (activeAnchorKeyRef.current) {
      const preferred = descriptorMap.get(activeAnchorKeyRef.current);
      if (preferred) {
        priorityDescriptors.push(preferred);
      }
    }

    descriptorList.forEach(descriptor => {
      if (!priorityDescriptors.includes(descriptor)) {
        priorityDescriptors.push(descriptor);
      }
    });

    let resolvedDescriptor: ElementDescriptor | null = null;
    let element: HTMLElement | null = null;

    for (const descriptor of priorityDescriptors) {
      if (!descriptor) {
        continue;
      }
      const candidate = resolveElementForDescriptor(descriptor);
      if (candidate) {
        resolvedDescriptor = descriptor;
        element = candidate;
        break;
      }
    }

    if (!element) {
      anchorElementRef.current = null;
      if (!anchorElementMissing) {
        setAnchorElementMissing(true);
      }
      return;
    }

    const resolvedKey = resolvedDescriptor ? descriptorKeyMap.get(resolvedDescriptor) : undefined;

    if (resolvedDescriptor && forceDevLogsFlag) {
      console.log('[ElementChatWindow] ensure resolved descriptor ' + JSON.stringify({
        descriptorKey: resolvedKey,
        chatId: resolvedDescriptor.chatId,
        offset: anchorOffsetRef.current,
      }));
    }

    anchorElementRef.current = element;

    if (anchorElementMissing) {
      setAnchorElementMissing(false);
    }

    if (resolvedKey && resolvedKey !== activeAnchorKeyRef.current) {
      setActiveAnchorKey(resolvedKey);
    }

    const rect = element.getBoundingClientRect();

    if (!anchorOffsetRef.current) {
      const inferredOffset = {
        x: positionRef.current.x - rect.left,
        y: positionRef.current.y - rect.top
      };
      if (forceDevLogsFlag) {
        console.log('[ElementChatWindow] ensureAnchorPosition infer offset ' + JSON.stringify({
          inferredOffset,
          currentPosition: positionRef.current,
          anchorRect: { top: rect.top, left: rect.left },
        }));
      }
      setAnchorOffset(inferredOffset);
      anchorOffsetRef.current = inferredOffset;
      if (resolvedKey) {
        anchorOffsetsRef.current.set(resolvedKey, inferredOffset);
      }
    }

    if (anchorOffsetRef.current && !isDraggingRef.current) {
      const nextPosition = {
        x: rect.left + anchorOffsetRef.current.x,
        y: rect.top + anchorOffsetRef.current.y
      };

      if (
        Math.abs(nextPosition.x - positionRef.current.x) > 0.5 ||
        Math.abs(nextPosition.y - positionRef.current.y) > 0.5
      ) {
        if (forceDevLogsFlag) {
          console.log('[ElementChatWindow] ensureAnchorPosition update ' + JSON.stringify({
            nextPosition,
            current: positionRef.current,
            anchorOffset: anchorOffsetRef.current,
            anchorRect: { top: rect.top, left: rect.left },
          }));
        }
        setPosition(nextPosition);
      }
    }

    if (resolvedKey && anchorOffsetRef.current) {
      anchorOffsetsRef.current.set(resolvedKey, anchorOffsetRef.current);
    }
  }, [anchorElementMissing, descriptorList, descriptorMap, descriptorKeyMap, setActiveAnchorKey]);

  useLayoutEffect(() => {
    ensureAnchorPosition();

    const handleUpdate = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        ensureAnchorPosition();
      });
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && anchorElementRef.current) {
      resizeObserver = new ResizeObserver(handleUpdate);
      resizeObserver.observe(anchorElementRef.current);
    }

    const mutationObserver = new MutationObserver(handleUpdate);
    mutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true
    });

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      mutationObserver.disconnect();
    };
  }, [ensureAnchorPosition]);

  useEffect(() => {
    ensureAnchorPosition();
  }, [anchorOffset, ensureAnchorPosition]);

  useEffect(() => {
    ensureAnchorPositionRef.current = ensureAnchorPosition;
  }, [ensureAnchorPosition]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const persistSessionState = useCallback(async (updatedMessages?: ChatMessage[]) => {
    try {
      const { saveElementChat, createElementChatSession } = await import('@/services/elementChatService');

      const activeDescriptor = activeAnchorKeyRef.current
        ? descriptorMap.get(activeAnchorKeyRef.current)
        : undefined;

      let session = sessionRef.current;
      if (!session) {
        session = createElementChatSession(
          elementId,
          window.location.href,
          primaryDescriptor,
          {
            position: positionRef.current,
            size: windowSizeRef.current,
            collapsed: collapseStateRef.current !== 'expanded',
            collapseState: collapseStateRef.current,
            anchorOffset: anchorOffsetRef.current || undefined,
            queueExpanded: queueExpandedRef.current,
            clearPreviousAssistant: clearPreviousAssistantRef.current,
            activeAnchorKey: activeAnchorKeyRef.current,
            activeAnchorChatId: activeDescriptor?.chatId
          },
          descriptorList
        );
        sessionRef.current = session;
      }

      session.messages = updatedMessages || messagesRef.current;
      session.windowState = {
        position: positionRef.current,
        size: windowSizeRef.current,
        collapsed: collapseStateRef.current !== 'expanded',
        collapseState: collapseStateRef.current,
        anchorOffset: anchorOffsetRef.current || undefined,
        queueExpanded: queueExpandedRef.current,
        clearPreviousAssistant: clearPreviousAssistantRef.current,
        activeAnchorKey: activeAnchorKeyRef.current,
        activeAnchorChatId: activeDescriptor?.chatId
      };

      await saveElementChat(session);
      console.log('[ElementChatWindow] Session saved:', elementId);
    } catch (error) {
      console.error('[ElementChatWindow] Failed to save session:', error);
    }
  }, [primaryDescriptor, descriptorList, descriptorMap, elementId]);

  /**
   * Save chat session (debounced)
   */
  const saveSession = useCallback((updatedMessages?: ChatMessage[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      void persistSessionState(updatedMessages);
    }, 500);
  }, [persistSessionState]);

  // Save when messages, position, size, or collapse state changes
  useEffect(() => {
    if (messages.length > 0 || sessionRef.current) {
      saveSession();
    }
  }, [messages, position, windowSize, collapseState, anchorOffset, queueExpanded, clearPreviousAssistant, saveSession]);

  const sendMessageToAPI = useCallback(
    async (userMessage: string, images: PendingImage[] = [], messageId?: string) => {
      const trimmedMessage = userMessage.trim();
      const contentForStorage = trimmedMessage || (images.length > 0 ? '(Image attached)' : '');
      const turnId = messageId ?? `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      isSendingRef.current = true;

      try {
        const { addMessageToChat, createElementChatSession } = await import('@/services/elementChatService');

        const activeDescriptor = activeAnchorKeyRef.current
          ? descriptorMap.get(activeAnchorKeyRef.current)
          : undefined;

        let session = sessionRef.current;
        if (!session) {
          session = createElementChatSession(
            elementId,
            window.location.href,
            primaryDescriptor,
            {
              position: positionRef.current,
              size: windowSizeRef.current,
              collapsed: collapseStateRef.current !== 'expanded',
              collapseState: collapseStateRef.current,
              anchorOffset: anchorOffsetRef.current || undefined,
              queueExpanded: queueExpandedRef.current,
              clearPreviousAssistant: clearPreviousAssistantRef.current,
              activeAnchorKey: activeAnchorKeyRef.current,
              activeAnchorChatId: activeDescriptor?.chatId
            },
            descriptorList
          );
          sessionRef.current = session;
        }

        const imagesForStorage = images.length > 0
          ? images.map(image => ({ ...image }))
          : undefined;

        await addMessageToChat(session, 'user', contentForStorage, {
          id: turnId,
          turnId,
          images: imagesForStorage,
        });

        const userTimestamp = Date.now();
        const userMessageEntry: ChatMessage = {
          id: turnId,
          role: 'user',
          content: contentForStorage,
          timestamp: userTimestamp,
          turnId,
          images: imagesForStorage,
        };

        const newMessages: ChatMessage[] = dedupeMessagesById([...messagesRef.current, userMessageEntry]);
        setMessages(newMessages);
        messagesRef.current = newMessages;
        session.messages = newMessages;
        upsertIndicatorsForSession(session);
        setIsStreaming(true);

        const { chatWithPage } = await import('@/services/claudeAPIService');

        let systemPrompt: string;

        if (selectedText) {
          systemPrompt = `You are helping the user understand and discuss a specific text selection from a web page.\n\nSelected text:\n"${selectedText}"\n\nPage: ${window.location.href}\nPage title: ${document.title}\n\nAnswer questions about this text, explain concepts, provide context, or help the user understand its meaning.`;
        } else {
          systemPrompt = `You are chatting about page elements.\n\nPrimary element: <${primaryDescriptor.tagName}>${primaryDescriptor.id ? ` id="${primaryDescriptor.id}"` : ''}${primaryDescriptor.classes.length > 0 ? ` class="${primaryDescriptor.classes.join(' ')}"` : ''}\nText content: ${primaryDescriptor.textPreview}\nAttached elements (${descriptorList.length} total): ${descriptorList
            .map(descriptor => `<${descriptor.tagName}>${descriptor.id ? `#${descriptor.id}` : ''}`)
            .join(', ')}\n\nPage: ${window.location.href}\nPage title: ${document.title}\n\nAnswer questions about these elements, their purpose, or how they work.`;
        }

        let assistantContent = '';
        const stream = await chatWithPage(
          systemPrompt,
          [...newMessages].map(m => ({
            role: m.role,
            content: m.content,
            images: m.images
          }))
        );

        resetStreamingSnapshot(false);

        for await (const chunk of stream) {
          if (isDevLoggingEnabled()) {
            console.debug('[ElementChatWindow] Streaming chunk received', { elementId, chunkLength: chunk.length });
          }
          assistantContent += chunk;
          if (!isMountedRef.current) {
            return;
          }
          setStreamingDeltas(prev => {
            const next = [...prev, chunk];
            applyStreamingSnapshot(next);
            return next;
          });
        }

        if (!isMountedRef.current) {
          return;
        }

        if (isDevLoggingEnabled()) {
          console.debug('[ElementChatWindow] Streaming complete', { elementId, assistantContentLength: assistantContent.length });
        }

        if (clearPreviousAssistantRef.current && session.messages.length > 0) {
          for (let i = session.messages.length - 1; i >= 0; i--) {
            if (session.messages[i].role === 'assistant') {
              session.messages.splice(i, 1);
              break;
            }
          }
        }

        const testDuplicateConfig = duplicateTestConfig ?? (
          typeof window !== 'undefined' ? (window as any).__NABOKOV_TEST_FORCE_DUPLICATE__ : undefined
        );

        if (!assistantContent.trim() && testDuplicateConfig && typeof testDuplicateConfig === 'object' && typeof testDuplicateConfig.mockContent === 'string') {
          assistantContent = testDuplicateConfig.mockContent;
        }

        let baseMessages = clearPreviousAssistantRef.current
          ? (() => {
              const cloned = [...newMessages];
              for (let i = cloned.length - 1; i >= 0; i--) {
                if (cloned[i].role === 'assistant') {
                  cloned.splice(i, 1);
                  break;
                }
              }
              return cloned;
            })()
          : newMessages;

        const deltaHistorySnapshot = [...streamingDeltaHistoryRef.current];
        const { answer: assistantAnswerRaw, thinking: assistantThinkingRaw } = separateAssistantResponse(
          assistantContent,
          deltaHistorySnapshot
        );
        const assistantContentForStorage = assistantAnswerRaw.trim().length > 0
          ? assistantAnswerRaw
          : assistantContent.replace(/^\s+/, '');
        const normalisedAssistant = assistantContentForStorage.trim();
        if (!normalisedAssistant) {
          resetStreamingSnapshot(true);
          return;
        }

        const assistantThinkingForStorage = assistantAnswerRaw.trim().length > 0 && assistantThinkingRaw
          ? assistantThinkingRaw.trim()
          : undefined;

        const shouldForceDuplicate = Boolean(testDuplicateConfig) && !(
          typeof testDuplicateConfig === 'object' && testDuplicateConfig !== null && testDuplicateConfig.duplicate === false
        );

        if (shouldForceDuplicate) {
          const forcedAssistantMessage: ChatMessage = {
            id: `forced-duplicate-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            role: 'assistant',
            content: assistantContentForStorage,
            thinking: assistantThinkingForStorage,
            timestamp: Date.now(),
            turnId,
          };
          baseMessages = [...baseMessages, forcedAssistantMessage];
          assistantTurnMapRef.current.set(turnId, forcedAssistantMessage.id);
          debugLog('[ElementChatWindow] Forced duplicate assistant entry for test harness', { elementId });
          if (typeof window !== 'undefined') {
            const persist = Boolean(
              typeof testDuplicateConfig === 'object' && testDuplicateConfig !== null && testDuplicateConfig.persist
            );
            if (!persist) {
              delete (window as any).__NABOKOV_TEST_FORCE_DUPLICATE__;
              duplicateTestConfig = null;
            }
          }
        }

        const assistantTimestamp = Date.now();
        let finalMessages: ChatMessage[] = baseMessages;
        const existingAssistantId = assistantTurnMapRef.current.get(turnId);
        const existingAssistantIndex = existingAssistantId
          ? baseMessages.findIndex(message => message.id === existingAssistantId)
          : -1;

        if (existingAssistantIndex >= 0) {
          const updatedMessages = baseMessages.map(message => {
            if (message.id === existingAssistantId) {
              return {
                ...message,
                content: assistantContentForStorage,
                thinking: assistantThinkingForStorage,
                timestamp: assistantTimestamp,
                turnId,
              };
            }
            return message;
          });

          finalMessages = dedupeMessagesById(updatedMessages);

          if (session) {
            const sessionIndex = session.messages.findIndex(message => message.id === existingAssistantId);
            if (sessionIndex >= 0) {
              session.messages[sessionIndex] = finalMessages.find(message => message.id === existingAssistantId) || session.messages[sessionIndex];
            }
            await addMessageToChat(session, 'assistant', assistantContentForStorage, {
              id: existingAssistantId,
              turnId,
              thinking: assistantThinkingForStorage,
            });
          }
        } else {
          const assistantMessageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const lastMessage = baseMessages[baseMessages.length - 1];

          const lastMessageContentTrimmed = lastMessage?.content.trim();
          if (
            lastMessage?.role === 'assistant' &&
            lastMessageContentTrimmed &&
            (lastMessageContentTrimmed === normalisedAssistant || lastMessageContentTrimmed === assistantContent.trim())
          ) {
            const updatedLast: ChatMessage = {
              ...lastMessage,
              content: assistantContentForStorage,
              thinking: assistantThinkingForStorage,
              timestamp: assistantTimestamp,
              turnId,
            };
            finalMessages = dedupeMessagesById([...baseMessages.slice(0, -1), updatedLast]);
            assistantTurnMapRef.current.set(turnId, updatedLast.id);

            if (session) {
              const sessionIndex = session.messages.findIndex(message => message.id === lastMessage.id);
              if (sessionIndex >= 0) {
                session.messages[sessionIndex] = updatedLast;
              }
            }

            debugLog('[ElementChatWindow] Skipped duplicate assistant bubble', { elementId });
          } else {
            const assistantMessage: ChatMessage = {
              id: assistantMessageId,
              role: 'assistant',
              content: assistantContentForStorage,
              thinking: assistantThinkingForStorage,
              timestamp: assistantTimestamp,
              turnId,
            };

            finalMessages = dedupeMessagesById([...baseMessages, assistantMessage]);
            assistantTurnMapRef.current.set(turnId, assistantMessageId);

            if (session) {
              await addMessageToChat(session, 'assistant', assistantContentForStorage, {
                id: assistantMessageId,
                turnId,
                thinking: assistantThinkingForStorage,
              });
            }
          }
        }

        session.messages = finalMessages;
        setMessages(finalMessages);
        messagesRef.current = finalMessages;
        resetStreamingSnapshot(true);
        if (typeof window !== 'undefined' && isDevLoggingEnabled()) {
          (window as any).__NABOKOV_DEBUG_LAST_MESSAGES__ = finalMessages;
        }

        if (isDevLoggingEnabled()) {
          const assistantCount = finalMessages.filter(message => message.role === 'assistant').length;
          console.debug('[ElementChatWindow] Assistant messages after update', { elementId, assistantCount });
        }

      } catch (error) {
        console.error('[ElementChatWindow] Error sending message:', error);
        if (!isMountedRef.current) {
          return;
        }
        resetStreamingSnapshot(true);
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          role: 'assistant',
          content: '❌ Error: Could not connect to API. Please check your backend is running or API key is configured.',
          timestamp: Date.now()
        };
        setMessages(prev => {
          const next = dedupeMessagesById([...prev, errorMessage]);
          messagesRef.current = next;
          return next;
        });
      } finally {
        isSendingRef.current = false;
        if (!isMountedRef.current) {
          return;
        }
        setIsStreaming(false);
        if (messageQueueRef.current.length > 0 && !isProcessingQueueRef.current && processQueueRef.current) {
          processQueueRef.current();
        }
      }
    }, [primaryDescriptor, descriptorList, elementId, selectedText]);

const processQueue = useCallback(async () => {
  if (!isMountedRef.current) {
    return;
  }
  if (messageQueueRef.current.length === 0 || isProcessingQueueRef.current) {
    return;
  }

  const [nextMessage, ...rest] = messageQueueRef.current;
  setMessageQueue(rest);
  messageQueueRef.current = rest;

  setIsProcessingQueue(true);
  isProcessingQueueRef.current = true;
  setActiveQueuedId(nextMessage.id);

  await sendMessageToAPI(nextMessage.content, nextMessage.images || [], nextMessage.messageId);

  setActiveQueuedId(null);
  setIsProcessingQueue(false);
  isProcessingQueueRef.current = false;

  if (messageQueueRef.current.length > 0) {
    setTimeout(() => {
      void processQueue();
    }, 100);
  }
}, [sendMessageToAPI]);

  useEffect(() => {
    processQueueRef.current = () => {
      void processQueue();
    };
  }, [processQueue]);

  const handleImageDrop = async (file: File) => {
    try {
      console.log('[ElementChatWindow] Processing image:', file.name);

      // Validate file is an image
      if (!isImageFile(file)) {
        console.error('[ElementChatWindow] Invalid file type:', file.type);
        return;
      }

      // Convert to base64
      const dataURL = await fileToBase64(file);

      // Get image dimensions
      const dimensions = await getImageDimensions(dataURL);

      // Add to pending images
      setPendingImages(prev => [...prev, {
        dataURL,
        width: dimensions.width,
        height: dimensions.height
      }]);

      console.log('[ElementChatWindow] Image added to pending:', dimensions);
    } catch (error) {
      console.error('[ElementChatWindow] Image processing failed:', error);
    }
  };

  const handleRemoveQueuedMessage = (id: string) => {
    setMessageQueue(prev => {
      const next = prev.filter(message => message.id !== id);
      messageQueueRef.current = next;
      return next;
    });
  };

  const handleClearQueue = () => {
    setMessageQueue([]);
    messageQueueRef.current = [];
    setActiveQueuedId(null);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && pendingImages.length === 0) {
      return;
    }

    const trimmed = inputValue.trim();
    const now = Date.now();
    const content = trimmed || (pendingImages.length > 0 ? '(Image attached)' : '');
    const imagesToSend = [...pendingImages];
    const signature = JSON.stringify({
      content,
      images: imagesToSend.map(img => img.dataURL),
    });

    const lastSubmission = lastSubmittedMessageRef.current;
    if (
      lastSubmission &&
      lastSubmission.signature === signature &&
      now - lastSubmission.timestamp < 1500
    ) {
      console.warn('[ElementChatWindow] Duplicate send suppressed');
      setInputValue('');
      setPendingImages([]);
      return;
    }

    const messageId = `msg-${now}-${Math.random().toString(36).substring(2, 9)}`;
    const queuedMessage: QueuedMessage = {
      id: `queued-${now}-${Math.random().toString(36).substring(2, 9)}`,
      content,
      images: imagesToSend.length > 0 ? imagesToSend : undefined,
      createdAt: now,
      messageId,
    };

    lastSubmittedMessageRef.current = { signature, timestamp: now, messageId };

    setInputValue('');
    setPendingImages([]);

    if (isStreaming || isProcessingQueueRef.current || isSendingRef.current) {
      console.log('[ElementChatWindow] Queueing message (busy):', queuedMessage.content);
      setMessageQueue(prev => {
        if (prev.some(item => item.messageId === queuedMessage.messageId)) {
          return prev;
        }
        const next = [...prev, queuedMessage];
        messageQueueRef.current = next;
        return next;
      });
      setQueueExpanded(true);
      return;
    }

    try {
      await sendMessageToAPI(queuedMessage.content, queuedMessage.images || [], queuedMessage.messageId);
      lastSubmittedMessageRef.current = {
        signature,
        timestamp: Date.now(),
        messageId,
      };
    } catch (error) {
      console.error('[ElementChatWindow] Failed to send message:', error);
      lastSubmittedMessageRef.current = null;
      return;
    }
    if (messageQueueRef.current.length > 0) {
      void processQueue();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDragStart = () => {
    isDraggingRef.current = true;
  };

  const handleDragStop = (_e: any, data: { x: number; y: number }) => {
    isDraggingRef.current = false;
    const nextPosition = { x: data.x, y: data.y };
    setPosition(nextPosition);

    if (anchorElementRef.current) {
      const rect = anchorElementRef.current.getBoundingClientRect();
      const offset = {
        x: nextPosition.x - rect.left,
        y: nextPosition.y - rect.top
      };
      setAnchorOffset(offset);
      anchorOffsetRef.current = offset;
      if (activeAnchorKeyRef.current) {
        anchorOffsetsRef.current.set(activeAnchorKeyRef.current, offset);
      }
    }
  };

  const handleResizeStop = (
    _e: any,
    _dir: any,
    ref: HTMLElement,
    _delta: any,
    newPosition: { x: number; y: number }
  ) => {
    setWindowSize({
      width: parseInt(ref.style.width),
      height: parseInt(ref.style.height)
    });
    setPosition(newPosition);

    if (anchorElementRef.current) {
      const rect = anchorElementRef.current.getBoundingClientRect();
      const offset = {
        x: newPosition.x - rect.left,
        y: newPosition.y - rect.top
      };
      setAnchorOffset(offset);
      anchorOffsetRef.current = offset;
      if (activeAnchorKeyRef.current) {
        anchorOffsetsRef.current.set(activeAnchorKeyRef.current, offset);
      }
    }
  };

  const handleResize = (
    _e: any,
    _dir: any,
    ref: HTMLElement
  ) => {
    const width = parseInt(ref.style.width, 10);
    const height = parseInt(ref.style.height, 10);
    setWindowSize({ width, height });
  };

  const handleCollapseToRectangle = () => {
    setCollapseState(prev => (prev === 'rectangle' ? 'expanded' : 'rectangle'));
  };

  const handleCollapseToSquare = () => {
    setCollapseState(prev => (prev === 'square' ? 'expanded' : 'square'));
  };

  const handleRequestClose = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    await persistSessionState();

    // Show post-chat indicator for regular element chats (not text-selection chats)
    if (!selectedText && anchorElementRef.current) {
      showPostChatIndicator(
        anchorElementRef.current,
        elementId,
        'active'
      );
    } else {
      // For text-selection chats, show the regular small indicators
      showIndicatorsForChat(elementId);
    }

    onClose();
  }, [elementId, onClose, persistSessionState, selectedText]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void handleRequestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRequestClose]);

  const handleClearHistory = async () => {
    if (messagesRef.current.length === 0 && messageQueueRef.current.length === 0) {
      return;
    }

    const confirmed = window.confirm('Clear chat history for this element?');
    if (!confirmed) {
      return;
    }

    try {
      if (sessionRef.current) {
        const { clearElementChatHistory } = await import('@/services/elementChatService');
        sessionRef.current = await clearElementChatHistory(sessionRef.current);
      }

      setMessages([]);
      messagesRef.current = [];
      resetStreamingSnapshot(false);
      handleClearQueue();
      removeIndicatorsForChat(elementId);
    } catch (error) {
      console.error('[ElementChatWindow] Failed to clear history:', error);
    }
  };

  /**
   * Save conversation to Stash
   */
  const handleSaveToStash = async () => {
    try {
      console.log('[ElementChatWindow] Saving conversation to Stash...');

      // Create card from conversation
      const card = await createCardFromConversation(true);

      console.log('[ElementChatWindow] Conversation saved to Stash successfully');

      // Show success message (could use a toast notification here)
      alert('💾 Conversation saved to Stash!');

    } catch (error) {
      console.error('[ElementChatWindow] Error saving to Stash:', error);
      alert('❌ Failed to save conversation to Stash');
    }
  };

  /**
   * Save conversation to Canvas
   */
  const handleSaveToCanvas = async () => {
    try {
      console.log('[ElementChatWindow] Saving conversation to Canvas...');

      // Create card from conversation
      const card = await createCardFromConversation(false);

      console.log('[ElementChatWindow] Conversation saved to Canvas successfully');

      // Show success message
      alert('🎨 Conversation saved to Canvas!');

    } catch (error) {
      console.error('[ElementChatWindow] Error saving to Canvas:', error);
      alert('❌ Failed to save conversation to Canvas');
    }
  };

  /**
   * Creates a Card from the current conversation
   */
  const createCardFromConversation = async (stashed: boolean) => {
    const { generateId } = await import('@/utils/storage');
    const { upsertCard } = await import('@/shared/services/cardService');

    // Build conversation HTML
    let conversationHTML = '<div class="element-chat-conversation">';

    // Add selected text banner if present
    if (selectedText) {
      conversationHTML += `
        <div style="background: ${ELEMENT_CHAT_THEME.selectedBannerBackground};
                    padding: 12px;
                    border-left: 4px solid ${ELEMENT_CHAT_THEME.selectedBannerContentBorder};
                    margin-bottom: 16px;
                    border-radius: 4px;">
          <div style="font-weight: 600; color: ${ELEMENT_CHAT_THEME.selectedBannerLabel}; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">
            📝 Selected Text
          </div>
          <div style="font-style: italic; color: ${ELEMENT_CHAT_THEME.messageTextColor}; line-height: 1.5;">
            "${selectedText}"
          </div>
        </div>
      `;
    } else {
      // Add element info
      conversationHTML += `
        <div style="background: ${ELEMENT_CHAT_THEME.queueBackground};
                    padding: 12px;
                    border-left: 4px solid ${ELEMENT_CHAT_THEME.containerAccent};
                    margin-bottom: 16px;
                    border-radius: 4px;">
          <div style="font-weight: 600; color: ${ELEMENT_CHAT_THEME.messageRoleColor}; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">
            💬 Element Context
          </div>
          <div style="font-family: monospace; font-size: 12px; margin-bottom: 4px; color: ${ELEMENT_CHAT_THEME.messageTextColor};">
            Primary: ${elementLabel}
          </div>
          <div style="color: ${ELEMENT_CHAT_THEME.messageTextColor}; font-size: 12px; margin-bottom: ${descriptorList.length > 1 ? '8px' : '0'};">
            ${elementSummary}
          </div>
          ${descriptorList.length > 1 ? `
            <div style="font-size: 12px; color: ${ELEMENT_CHAT_THEME.messageTextColor};">
              <strong>Attached:</strong>
              <ul style="margin: 6px 0 0 16px; padding: 0;">
                ${descriptorList.slice(1).map(descriptor => `
                  <li style="line-height: 1.4;">&lt;${descriptor.tagName}${descriptor.id ? `#${descriptor.id}` : ''}${descriptor.classes.length ? '.' + descriptor.classes.slice(0, 2).join('.') : ''}&gt;</li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `;
    }

    // Add messages
    for (const message of messages) {
      const isUser = message.role === 'user';
      conversationHTML += `
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 600;
                      color: ${isUser ? ELEMENT_CHAT_THEME.messageRoleColor : ELEMENT_CHAT_THEME.assistantRoleColor};
                      font-size: 11px;
                      text-transform: uppercase;
                      margin-bottom: 6px;">
            ${isUser ? 'You' : 'Assistant'}
          </div>
          <div style="background: ${isUser ? ELEMENT_CHAT_THEME.messageUserBackground : ELEMENT_CHAT_THEME.messageAssistantBackground};
                      padding: 10px;
                      border-radius: 6px;
                      line-height: 1.5;
                      color: ${ELEMENT_CHAT_THEME.messageTextColor};">
            ${message.content}
          </div>
        </div>
      `;
    }

    conversationHTML += '</div>';

    // Create card
    const card: Card = {
      id: generateId(),
      content: conversationHTML,
      metadata: {
        url: window.location.href,
        title: selectedText
          ? `Chat: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"`
          : `Element Chat: ${elementLabel} – ${elementSummary}`,
        domain: window.location.hostname,
        favicon: '',
        timestamp: Date.now(),
        selector: primaryDescriptor.id ? `#${primaryDescriptor.id}` : primaryDescriptor.tagName,
        selectedText: selectedText
      },
      starred: false,
      tags: ['element-chat'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cardType: 'note' as const,
      stashed: stashed
    };

    // Save card
    await upsertCard(card);

    return card;
  };

  // Element context info
  const elementLabel = useMemo(() => {
    const parts: string[] = [`<${primaryDescriptor.tagName}`];
    if (primaryDescriptor.id) {
      parts.push(`#${primaryDescriptor.id}`);
    }
    if (primaryDescriptor.classes.length > 0) {
      const classes = primaryDescriptor.classes.slice(0, 3).join('.');
      parts.push(`.${classes}`);
      if (primaryDescriptor.classes.length > 3) {
        parts.push('…');
      }
    }
    return `${parts.join('')}>`;
  }, [primaryDescriptor]);

  const elementSummary = useMemo(() => {
    if (selectedText) {
      return selectedText.length > 60 ? `${selectedText.substring(0, 57)}...` : selectedText;
    }
    if (primaryDescriptor.textPreview) {
      return primaryDescriptor.textPreview.length > 60
        ? `${primaryDescriptor.textPreview.substring(0, 57)}...`
        : primaryDescriptor.textPreview;
    }
    return 'No text content';
  }, [primaryDescriptor.textPreview, selectedText]);

  return (
    <Rnd
      position={position}
      size={{
        width: isSquareCollapsed ? squareSize : windowSize.width,
        height: isExpanded
          ? windowSize.height
          : (isRectangleCollapsed ? headerOnlyHeight : squareSize)
      }}
      style={{ pointerEvents: 'auto' }}
      onDragStop={handleDragStop}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
      resizeHandleComponent={resizeHandleComponents}
      minWidth={isExpanded ? 300 : squareSize}
      minHeight={isExpanded ? 200 : (isSquareCollapsed ? squareSize : headerOnlyHeight)}
      dragHandleClassName="drag-handle"
      enableResizing={isExpanded ? {
        bottom: true,
        bottomRight: true,
        bottomLeft: true,
        right: true,
        left: true,
        top: false,
        topRight: false,
        topLeft: false
      } : false}
    >
      <div
        ref={rootContainerRef}
        css={containerStyles(collapseState, isStreaming)}
        data-collapse-state={collapseState}
        data-processing={isStreaming ? 'true' : 'false'}
        data-message-count={messages.length}
        className={isSquareCollapsed ? 'drag-handle' : undefined}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {isSquareCollapsed ? (
          <button
            css={squareToggleButtonStyles(hasHistory)}
            onClick={() => setCollapseState('expanded')}
            title="Expand chat"
            type="button"
            data-test-id="square-expand-toggle"
          >
            <span css={squareIconStyles}>💬</span>
            {hasHistory && <span css={squareBadgeStyles}>{messages.length}</span>}
          </button>
        ) : (
          <>
            <div css={headerStyles} className="drag-handle">
              <div css={headerTitleStyles} title={primaryDescriptor.cssSelector}>
                <span css={iconStyles}>💬</span>
                <div css={elementInfoStyles}>
                  <span css={elementLabelStyles}>{elementLabel}</span>
                  <span css={elementSummaryStyles}>{elementSummary}</span>
                </div>
                {hasHistory && <span css={messageCountStyles}>{messages.length}</span>}
              </div>
              <div css={headerActionsStyles}>
                {hasHistory && (
                  <>
                    <button
                      css={saveButtonStyles}
                      onClick={handleSaveToStash}
                      title="Save conversation to Stash"
                      disabled={isStreaming}
                    >
                      📥
                    </button>
                    <button
                      css={saveButtonStyles}
                      onClick={handleSaveToCanvas}
                      title="Save conversation to Canvas"
                      disabled={isStreaming}
                    >
                      🎨
                    </button>
                  </>
                )}
                <button
                  css={headerButtonStyles}
                  onClick={handleClearHistory}
                  title="Clear chat history"
                  disabled={messages.length === 0 && messageQueue.length === 0}
                  data-test-id="clear-history"
                  type="button"
                >
                  🧹
                </button>
                <button
                  css={[headerButtonStyles, collapseToggleButtonStyles(isRectangleCollapsed)]}
                  onClick={handleCollapseToRectangle}
                  title={isRectangleCollapsed ? 'Expand to full window' : 'Collapse to rectangle'}
                  aria-pressed={isRectangleCollapsed}
                  data-test-id="collapse-rectangle-button"
                  type="button"
                >
                  {isRectangleCollapsed ? '⤢' : '▭'}
                </button>
                <button
                  css={[headerButtonStyles, collapseToggleButtonStyles(isSquareCollapsed)]}
                  onClick={handleCollapseToSquare}
                  title={isSquareCollapsed ? 'Expand to full window' : 'Collapse to square'}
                  aria-pressed={isSquareCollapsed}
                  data-test-id="collapse-square-button"
                  type="button"
                >
                  {isSquareCollapsed ? '⤢' : '◼'}
                </button>
                <button
                  css={headerButtonStyles}
                  onClick={() => { void handleRequestClose(); }}
                  title="Close"
                  type="button"
                >
                  ✕
                </button>
              </div>
            </div>

            {isExpanded && isStreaming && (
              <div css={streamingIndicatorStyles}>
                ✨ Generating response...
              </div>
            )}

            {isExpanded && (
              <div css={anchorChipRowStyles} data-test-id="element-anchor-list">
                {descriptorEntries.map(({ descriptor, key, index }) => (
                  <button
                    key={key}
                    css={anchorChipStyles(key === activeAnchorKey)}
                    onClick={() => {
                      if (forceDevLogsFlag) {
                        console.log('[ElementChatWindow] anchor chip select ' + JSON.stringify({
                          nextAnchorKey: key,
                          storedOffset: anchorOffsetsRef.current.get(key),
                          currentOffset: anchorOffsetRef.current,
                        }));
                      }
                      activeAnchorKeyRef.current = key;
                      setActiveAnchorKey(key);
                      const element = resolveElementForDescriptor(descriptor);
                      if (element) {
                        anchorElementRef.current = element;
                        if (anchorElementMissing) {
                          setAnchorElementMissing(false);
                        }

                        const rect = element.getBoundingClientRect();
                        let nextOffset: { x: number; y: number };

                        const storedOffset = anchorOffsetsRef.current.get(key);
                        if (storedOffset) {
                          nextOffset = { ...storedOffset };
                        } else if (anchorOffsetRef.current) {
                          nextOffset = { ...anchorOffsetRef.current };
                        } else {
                          nextOffset = { x: Math.min(rect.width + 20, 240), y: 0 };
                        }

                        if (!storedOffset) {
                          nextOffset = {
                            x: nextOffset.x,
                            y: nextOffset.y - ANCHOR_ALIGNMENT_NUDGE_PX
                          };
                        }

                        anchorOffsetRef.current = nextOffset;
                        setAnchorOffset(nextOffset);
                        anchorOffsetsRef.current.set(key, nextOffset);

                        const nextPosition = {
                          x: rect.left + nextOffset.x,
                          y: rect.top + nextOffset.y,
                        };
                        if (forceDevLogsFlag) {
                          console.log('[ElementChatWindow] anchor chip position target ' + JSON.stringify({
                            rect: { top: rect.top, left: rect.left },
                            nextOffset,
                            nextPosition,
                            currentPosition: positionRef.current,
                            descriptorRect: descriptor.boundingRect,
                          }));
                        }
                        positionRef.current = nextPosition;
                        setPosition(nextPosition);
                      }
                      ensureAnchorPosition();
                    }}
                    type="button"
                  >
                    #{index + 1} · &lt;{descriptor.tagName}{descriptor.id ? `#${descriptor.id}` : ''}&gt;
                  </button>
                ))}
              </div>
            )}

            {/* Selected Text Banner (for text-contextual chat) */}
            {isExpanded && selectedText && (
              <div css={selectedTextBannerStyles}>
                <div css={selectedTextLabelStyles}>
                  <span css={selectedTextIconStyles}>📝</span>
                  <span>Selected Text</span>
                </div>
                <div css={selectedTextContentStyles}>
                  "{selectedText.length > 200 ? selectedText.substring(0, 200) + '...' : selectedText}"
                </div>
              </div>
            )}

            {/* Messages */}
            {isExpanded && (
              <div css={messagesContainerStyles}>
                {messages.length === 0 && (
                  <div css={emptyStateStyles}>
                    <div css={emptyIconStyles}>{selectedText ? '📝' : '💬'}</div>
                    <div css={emptyTitleStyles}>
                      {selectedText ? 'Discuss selected text' : 'Chat with this element'}
                    </div>
                    <div css={emptyDescStyles}>
                      {selectedText
                        ? 'Ask questions about the selected text, get explanations, or explore its meaning.'
                        : 'Ask questions about this element, its purpose, or how it works.'
                      }
                    </div>
                    {!selectedText && (
                      <>
                        <div css={emptyHintStyles}>
                          <strong>Element:</strong> {elementLabel}
                        </div>
                        <div css={emptyHintStyles} style={{ marginTop: '8px' }}>
                          <strong>Text:</strong> {elementSummary}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    css={messageStyles(message.role)}
                    data-message-role={message.role}
                    data-message-id={message.id}
                  >
                    <div css={messageRoleStyles}>
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    {message.images && message.images.length > 0 && (
                      <div css={messageImagesStyles}>
                        {message.images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img.dataURL}
                            alt="Message attachment"
                            css={messageImageStyles}
                          />
                        ))}
                      </div>
                    )}
                    <div css={messageContentStyles}>
                      {message.role === 'assistant' && message.thinking && (
                        <div
                          css={reasoningContainerStyles}
                          data-reasoning-container={message.id}
                        >
                          <button
                            type="button"
                            css={reasoningToggleStyles}
                            onClick={() => toggleReasoningForMessage(message.id)}
                            data-reasoning-toggle={message.id}
                            aria-expanded={expandedReasoningMap[message.id] ? 'true' : 'false'}
                            aria-controls={`assistant-reasoning-${message.id}`}
                          >
                            <span css={reasoningToggleIconStyles} aria-hidden="true">
                              {expandedReasoningMap[message.id] ? '▾' : '▸'}
                            </span>
                            <span>{expandedReasoningMap[message.id] ? 'Hide reasoning' : 'Show reasoning'}</span>
                          </button>
                          {expandedReasoningMap[message.id] && (
                            <div
                              css={reasoningContentStyles}
                              id={`assistant-reasoning-${message.id}`}
                              data-reasoning-content={message.id}
                            >
                              {renderMarkdown(message.thinking)}
                            </div>
                          )}
                        </div>
                      )}
                      {renderMarkdown(message.content)}
                    </div>
                  </div>
                ))}

                {isStreaming && streamingDeltas.length > 0 && (
                  <div
                    css={messageStyles('assistant')}
                    data-message-role="assistant"
                    data-message-streaming="true"
                  >
                    <div css={messageRoleStyles}>Assistant</div>
                    <div css={messageContentStyles}>
                      <div css={streamingDeltasContainerStyles} ref={streamingDeltasRef}>
                        {streamingDeltas.map((delta, index) => (
                          <div
                            css={streamingDeltaLineStyles}
                            key={`delta-${index}`}
                            data-delta-index={index}
                          >
                            {renderMarkdown(delta)}
                          </div>
                        ))}
                      </div>
                      <span css={cursorStyles}>▊</span>
                    </div>
                  </div>
                )}

                {isStreaming && streamingDeltas.length === 0 && (
                  <div css={messageStyles('assistant')}>
                    <div css={messageRoleStyles}>Assistant</div>
                    <div css={loadingDotsStyles}>
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Input */}
            {isExpanded && (
              <>
                {(messageQueue.length > 0 || isProcessingQueue) && (
                  <div css={queueContainerStyles} data-expanded={queueExpanded ? 'true' : 'false'}>
                    <div css={queueHeaderStyles}>
                      <button
                        css={queueToggleButtonStyles}
                        onClick={() => setQueueExpanded(prev => !prev)}
                        data-test-id="toggle-queue"
                      >
                        {queueExpanded ? `Hide queue (${messageQueue.length})` : `Show queue (${messageQueue.length})`}
                      </button>
                      <div css={queueHeaderActionsStyles}>
                        {isProcessingQueue && <span css={queueStatusStyles}>Processing…</span>}
                        {messageQueue.length > 0 && (
                          <button
                            css={queueClearButtonStyles}
                            onClick={handleClearQueue}
                            title="Clear queued messages"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {queueExpanded && messageQueue.length > 0 && (
                      <div css={queueListStyles} data-test-id="element-chat-queue-list">
                        {messageQueue.map(message => (
                          <div
                            key={message.id}
                            css={queueItemStyles}
                            data-active={message.id === activeQueuedId ? 'true' : 'false'}
                          >
                            <span css={queueItemTextStyles}>
                              {message.content}
                            </span>
                            <div css={queueItemActionsStyles}>
                              {message.images && message.images.length > 0 && (
                                <span css={queueBadgeStyles}>🖼️ {message.images.length}</span>
                              )}
                              <button
                                css={queueRemoveButtonStyles}
                                onClick={() => handleRemoveQueuedMessage(message.id)}
                                title="Remove from queue"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <label css={queuePreferenceStyles}>
                  <input
                    type="checkbox"
                    checked={clearPreviousAssistant}
                    onChange={(e) => setClearPreviousAssistant(e.target.checked)}
                  />
                  <span>Replace last assistant reply when queue sends</span>
                </label>

                <div css={inputContainerStyles}>
                  <ImageUploadZone onImageUpload={handleImageDrop}>
                    <div css={inputWrapperStyles}>
                      {pendingImages.length > 0 && (
                        <div css={imagePreviewsContainerStyles}>
                          {pendingImages.map((img, idx) => (
                            <div key={idx} css={imagePreviewStyles}>
                              <img src={img.dataURL} alt="Pending upload" css={imagePreviewImgStyles} />
                              <button
                                css={removeImageButtonStyles}
                                onClick={() => {
                                  setPendingImages(prev => prev.filter((_, i) => i !== idx));
                                }}
                                title="Remove image"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <textarea
                        ref={inputRef}
                        css={textareaStyles}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder={isStreaming ? "Composing next message..." : "Ask about this element (drag images here)..."}
                        rows={2}
                      />
                    </div>
                  </ImageUploadZone>
              <button
                css={sendButtonStyles}
                onClick={handleSendMessage}
                disabled={isStreaming || (!inputValue.trim() && pendingImages.length === 0)}
                title={isStreaming ? "Generating response..." : "Send message"}
                data-test-id="send-button"
              >
                ➤
              </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Rnd>
  );
};

// ============================================================================
// Styles (red chat theme)
// ============================================================================

const containerStyles = (collapseState: CollapseState, isStreaming: boolean) => css`
  width: 100%;
  height: ${collapseState === 'expanded' ? '100%' : 'auto'};
  background: ${isStreaming
    ? 'linear-gradient(135deg, rgba(255, 250, 247, 1) 0%, rgba(255, 245, 240, 1) 100%)'
    : ELEMENT_CHAT_THEME.containerBackgroundGradient};
  border: 2px solid ${isStreaming ? 'rgba(177, 60, 60, 0.6)' : ELEMENT_CHAT_THEME.containerAccent};
  border-radius: 8px;
  box-shadow: ${isStreaming
    ? '0 18px 38px rgba(177, 60, 60, 0.15), inset 0 0 0 1px rgba(177, 60, 60, 0.1)'
    : ELEMENT_CHAT_THEME.containerShadow};
  display: flex;
  flex-direction: column;
  align-items: ${collapseState === 'square' ? 'center' : 'stretch'};
  justify-content: ${collapseState === 'square' ? 'center' : 'flex-start'};
  padding: ${collapseState === 'square' ? '6px' : '0'};
  z-index: 999999;
  pointer-events: auto;
  font-family: ${ELEMENT_CHAT_THEME.fontFamily};
  transition: all 0.3s ease;
  overflow: ${collapseState === 'expanded' ? 'visible' : 'hidden'};
`;

const squareToggleButtonStyles = (hasHistory: boolean) => css`
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 6px;
  background: ${hasHistory ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.08)'};
  color: ${ELEMENT_CHAT_THEME.iconColor};
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);

  &:hover {
    background: rgba(255, 255, 255, 0.22);
    transform: translateY(-1px);
  }
`;

const squareIconStyles = css`
  font-size: 26px;
`;

const squareBadgeStyles = css`
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: ${ELEMENT_CHAT_THEME.containerAccent};
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(139, 0, 0, 0.35);
`;

const headerStyles = css`
  background: ${ELEMENT_CHAT_THEME.headerGradient};
  color: ${ELEMENT_CHAT_THEME.headerTextColor};
  padding: 10px 12px;
  border-radius: 6px 6px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
  user-select: none;
  flex-shrink: 0;
`;

const headerTitleStyles = css`
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
`;

const elementInfoStyles = css`
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 240px;
`;

const elementLabelStyles = css`
  font-family: 'Courier New', monospace;
  font-size: 12px;
  opacity: 0.95;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const elementSummaryStyles = css`
  font-size: 11px;
  color: ${ELEMENT_CHAT_THEME.headerInfoText};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const messageCountStyles = css`
  background: ${ELEMENT_CHAT_THEME.headerBadgeBackground};
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: ${ELEMENT_CHAT_THEME.headerBadgeText};
`;

const iconStyles = css`
  font-size: 16px;
  color: ${ELEMENT_CHAT_THEME.iconColor};
`;

const headerActionsStyles = css`
  display: flex;
  gap: 4px;
`;

const headerButtonStyles = css`
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 3px;
  padding: 3px 8px;
  color: ${ELEMENT_CHAT_THEME.headerTextColor};
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.28);
    border-color: rgba(255, 255, 255, 0.5);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const collapseToggleButtonStyles = (isActive: boolean) => css`
  background: ${isActive ? 'rgba(255, 255, 255, 0.32)' : 'rgba(255, 255, 255, 0.18)'};
  border-color: ${isActive ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.35)'};
  color: ${isActive ? ELEMENT_CHAT_THEME.iconColor : ELEMENT_CHAT_THEME.headerTextColor};
`;

const saveButtonStyles = css`
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 3px;
  padding: 3px 8px;
  color: ${ELEMENT_CHAT_THEME.headerTextColor};
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.32);
    border-color: rgba(255, 255, 255, 0.55);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const selectedTextBannerStyles = css`
  background: ${ELEMENT_CHAT_THEME.selectedBannerBackground};
  border-bottom: ${ELEMENT_CHAT_THEME.selectedBannerBorder};
  padding: 10px 12px;
  flex-shrink: 0;
`;

const selectedTextLabelStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 11px;
  color: ${ELEMENT_CHAT_THEME.selectedBannerLabel};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
`;

const selectedTextIconStyles = css`
  font-size: 14px;
`;

const selectedTextContentStyles = css`
  font-size: 13px;
  color: ${ELEMENT_CHAT_THEME.messageTextColor};
  line-height: 1.5;
  font-style: italic;
  padding: 8px;
  background: ${ELEMENT_CHAT_THEME.selectedBannerContentBackground};
  border-left: 3px solid ${ELEMENT_CHAT_THEME.selectedBannerContentBorder};
  border-radius: 4px;
  max-height: 100px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
  }

  &::-webkit-scrollbar-thumb {
    background: ${ELEMENT_CHAT_THEME.containerAccent};
    border-radius: 2px;
  }
`;

const messagesContainerStyles = css`
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background: ${ELEMENT_CHAT_THEME.messagesBackground};

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
  }

  &::-webkit-scrollbar-thumb {
    background: ${ELEMENT_CHAT_THEME.containerAccent};
    border-radius: 3px;

    &:hover {
      background: ${ELEMENT_CHAT_THEME.containerAccent};
    }
  }
`;

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 20px;
  color: #666;
`;

const emptyIconStyles = css`
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.7;
`;

const emptyTitleStyles = css`
  font-size: 18px;
  font-weight: 600;
  color: ${ELEMENT_CHAT_THEME.messageRoleColor};
  margin-bottom: 8px;
`;

const emptyDescStyles = css`
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 12px;
`;

const emptyHintStyles = css`
  font-size: 12px;
  color: #999;
  padding: 8px 12px;
  background: ${ELEMENT_CHAT_THEME.queueBackground};
  border-radius: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const messageStyles = (role: 'user' | 'assistant') => css`
  margin: 8px 0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  animation: slideIn 0.2s ease-out;

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  ${role === 'user'
    ? css`
        background: ${ELEMENT_CHAT_THEME.messageUserBackground};
        border-left: 3px solid ${ELEMENT_CHAT_THEME.messageUserBorder};
        margin-left: 20px;
      `
    : css`
        background: ${ELEMENT_CHAT_THEME.messageAssistantBackground};
        border-left: 3px solid ${ELEMENT_CHAT_THEME.messageAssistantBorder};
        margin-right: 20px;
      `}
`;

const messageRoleStyles = css`
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${ELEMENT_CHAT_THEME.messageRoleColor};
  margin-bottom: 4px;
`;

const messageContentStyles = css`
  color: ${ELEMENT_CHAT_THEME.messageTextColor};
  word-break: break-word;

  strong {
    font-weight: 600;
  }

  p {
    margin: 0 0 8px 0;
  }

  ul,
  ol {
    margin: 0 0 8px 18px;
    padding: 0;
  }

  li {
    margin-bottom: 4px;
  }

  code {
    background: ${ELEMENT_CHAT_THEME.codeBackground};
    padding: 2px 5px;
    border-radius: 4px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 12px;
  }

  pre {
    background: ${ELEMENT_CHAT_THEME.preBackground};
    padding: 10px;
    border-radius: 8px;
    overflow-x: auto;
    border: 1px solid rgba(177, 60, 60, 0.2);
  }

  a {
    color: ${ELEMENT_CHAT_THEME.messageLinkColor};
    text-decoration: underline;
  }
`;

const reasoningContainerStyles = css`
  border: 1px solid rgba(177, 60, 60, 0.25);
  background: rgba(177, 60, 60, 0.08);
  border-radius: 6px;
  margin-bottom: 10px;
  overflow: hidden;
`;

const reasoningToggleStyles = css`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  color: ${ELEMENT_CHAT_THEME.assistantRoleColor};
  font-weight: 600;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: rgba(177, 60, 60, 0.12);
  }

  &:focus-visible {
    outline: 2px solid ${ELEMENT_CHAT_THEME.containerAccent};
    outline-offset: 2px;
  }
`;

const reasoningToggleIconStyles = css`
  font-size: 14px;
  line-height: 1;
`;

const reasoningContentStyles = css`
  padding: 8px 12px;
  border-top: 1px solid rgba(177, 60, 60, 0.2);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;

  p {
    margin: 0 0 6px 0;
  }

  ul,
  ol {
    margin: 0 0 6px 18px;
  }
`;

const streamingIndicatorStyles = css`
  color: #b83c1f;
  font-weight: 500;
  font-style: italic;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(177, 60, 60, 0.2);
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
`;

const streamingDeltasContainerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  max-height: 200px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid rgba(177, 60, 60, 0.25);
  background: rgba(177, 60, 60, 0.05);
`;

const streamingDeltaLineStyles = css`
  padding: 4px 6px;
  border-radius: 4px;
  background: rgba(177, 60, 60, 0.08);
  word-break: break-word;
  white-space: pre-wrap;
`;

const cursorStyles = css`
  animation: blink 1s infinite;
  color: ${ELEMENT_CHAT_THEME.containerAccent};

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
`;

const loadingDotsStyles = css`
  display: flex;
  gap: 4px;
  padding: 8px 0;

  span {
    width: 6px;
    height: 6px;
    background: ${ELEMENT_CHAT_THEME.containerAccent};
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;

    &:nth-of-type(1) {
      animation-delay: -0.32s;
    }

    &:nth-of-type(2) {
      animation-delay: -0.16s;
    }
  }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }
`;

const inputContainerStyles = css`
  border-top: 1px solid ${ELEMENT_CHAT_THEME.inputBorder};
  padding: 10px;
  display: flex;
  gap: 8px;
  background: ${ELEMENT_CHAT_THEME.inputBackground};
  flex-shrink: 0;
`;

const textareaStyles = css`
  flex: 1;
  border: 1px solid ${ELEMENT_CHAT_THEME.inputBorder};
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  line-height: 1.4;
  background: ${ELEMENT_CHAT_THEME.messagesBackground};

  &:focus {
    outline: none;
    border-color: ${ELEMENT_CHAT_THEME.inputFocus};
    box-shadow: 0 0 0 2px rgba(194, 59, 34, 0.2);
  }

  &:disabled {
    background: rgba(0, 0, 0, 0.05);
    cursor: not-allowed;
  }
`;

const sendButtonStyles = css`
  background: ${ELEMENT_CHAT_THEME.sendButtonGradient};
  color: ${ELEMENT_CHAT_THEME.headerTextColor};
  border: 1px solid ${ELEMENT_CHAT_THEME.sendButtonBorder};
  border-radius: 4px;
  padding: 8px 16px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  align-self: flex-end;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: ${ELEMENT_CHAT_THEME.sendButtonShadow};
    border-color: ${ELEMENT_CHAT_THEME.containerAccent};
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const queueContainerStyles = css`
  background: ${ELEMENT_CHAT_THEME.queueBackground};
  border: 1px solid ${ELEMENT_CHAT_THEME.queueBorder};
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const queueHeaderStyles = css`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
`;

const queueToggleButtonStyles = css`
  background: ${ELEMENT_CHAT_THEME.queueAccentSoft};
  border: 1px solid ${ELEMENT_CHAT_THEME.queueBorder};
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: ${ELEMENT_CHAT_THEME.queueText};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${ELEMENT_CHAT_THEME.queueBackground};
  }
`;

const queueHeaderActionsStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const queueStatusStyles = css`
  font-size: 11px;
  color: ${ELEMENT_CHAT_THEME.queueAccent};
`;

const queueClearButtonStyles = css`
  background: ${ELEMENT_CHAT_THEME.queueAccentSoft};
  border: 1px solid ${ELEMENT_CHAT_THEME.queueBorder};
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 11px;
  color: ${ELEMENT_CHAT_THEME.queueText};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${ELEMENT_CHAT_THEME.queueBackground};
  }
`;

const queueListStyles = css`
  max-height: 160px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${ELEMENT_CHAT_THEME.queueAccent};
    border-radius: 4px;
  }
`;

const queueItemStyles = css`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 8px;
  border: 1px solid ${ELEMENT_CHAT_THEME.queueBorder};
  border-radius: 8px;
  background: ${ELEMENT_CHAT_THEME.messagesBackground};
  font-size: 12px;

  &[data-active='true'] {
    border-color: ${ELEMENT_CHAT_THEME.queueAccent};
    box-shadow: 0 0 0 1px rgba(194, 59, 34, 0.2);
  }
`;

const queueItemTextStyles = css`
  flex: 1;
  color: ${ELEMENT_CHAT_THEME.queueText};
  white-space: pre-wrap;
  word-break: break-word;
`;

const queueItemActionsStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const queueBadgeStyles = css`
  background: ${ELEMENT_CHAT_THEME.queueAccentSoft};
  color: ${ELEMENT_CHAT_THEME.queueText};
  border-radius: 10px;
  padding: 1px 6px;
  font-size: 11px;
`;

const queueRemoveButtonStyles = css`
  background: ${ELEMENT_CHAT_THEME.queueAccentSoft};
  border: 1px solid ${ELEMENT_CHAT_THEME.queueBorder};
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 11px;
  color: ${ELEMENT_CHAT_THEME.queueText};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${ELEMENT_CHAT_THEME.queueBackground};
  }
`;

const queuePreferenceStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: ${ELEMENT_CHAT_THEME.queueText};
  margin: 4px 0 8px;

  input {
    margin: 0;
  }
`;

const inputWrapperStyles = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const imagePreviewsContainerStyles = css`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 4px;
  background: ${ELEMENT_CHAT_THEME.queueBackground};
  border-radius: 3px;
`;

const imagePreviewStyles = css`
  position: relative;
  width: 80px;
  height: 80px;
  border: 1px solid ${ELEMENT_CHAT_THEME.imagePreviewBorder};
  border-radius: 3px;
  overflow: hidden;
`;

const imagePreviewImgStyles = css`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const removeImageButtonStyles = css`
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(139, 0, 0, 0.8);
  color: white;
  border: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(139, 0, 0, 1);
    transform: scale(1.1);
  }
`;

const messageImagesStyles = css`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 6px 0;
`;

const messageImageStyles = css`
  max-width: 200px;
  max-height: 200px;
  border-radius: 4px;
  border: 1px solid ${ELEMENT_CHAT_THEME.imagePreviewBorder};
  object-fit: contain;
  background: rgba(0, 0, 0, 0.02);
`;
const anchorChipRowStyles = css`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px 0 16px;
`;

const anchorChipStyles = (active: boolean) => css`
  border: 1px solid ${active ? ELEMENT_CHAT_THEME.containerAccent : ELEMENT_CHAT_THEME.anchorChipBorder};
  background: ${active ? ELEMENT_CHAT_THEME.anchorChipActiveBg : ELEMENT_CHAT_THEME.anchorChipInactiveBg};
  color: ${ELEMENT_CHAT_THEME.queueText};
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${ELEMENT_CHAT_THEME.containerAccent};
    background: ${ELEMENT_CHAT_THEME.anchorChipActiveBg};
  }
`;



const resizeHandleCornerStyles = css`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: ${ELEMENT_CHAT_THEME.containerAccent};
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
`;

const resizeHandleHorizontalStyles = css`
  width: 48px;
  height: 8px;
  border-radius: 999px;
  background: rgba(194, 59, 34, 0.28);
  margin-bottom: 6px;
`;

const resizeHandleVerticalStyles = css`
  width: 8px;
  height: 48px;
  border-radius: 999px;
  background: rgba(194, 59, 34, 0.28);
  margin-right: 6px;
`;

const resizeHandleComponents = {
  bottomRight: <span css={resizeHandleCornerStyles} />,
  bottomLeft: <span css={resizeHandleCornerStyles} />,
  bottom: <span css={resizeHandleHorizontalStyles} />,
  right: <span css={resizeHandleVerticalStyles} />,
  left: <span css={resizeHandleVerticalStyles} />,
};
