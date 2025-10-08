/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { Rnd } from 'react-rnd';
import type { DraggableData } from 'react-rnd';
import type { PageContext } from '@/services/pageContextCapture';
import type { ElementContext } from '@/services/elementContextCapture';
import { formatPageContextAsPrompt, capturePageContext } from '@/services/pageContextCapture';
import { formatElementContextAsPrompt } from '@/services/elementContextCapture';
import { fileToBase64, getImageDimensions, isImageFile } from '@/utils/imageUpload';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MessageStatus = 'queued' | 'processing' | 'complete' | 'error';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: Array<{
    dataURL: string;      // "data:image/png;base64,..."
    width: number;        // Original dimensions
    height: number;
  }>;
  status?: MessageStatus;
  linkedTo?: string;
  createdAt: number;
}

const generateMessageId = (prefix: 'user' | 'assistant'): string => {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
};

export interface InlineChatWindowProps {
  onClose: () => void;
  initialContext: PageContext | ElementContext;
  elementPosition?: { x: number; y: number }; // For positioning near element
  onSaveToCanvas?: (messages: Message[]) => Promise<void>;
  anchorElements?: HTMLElement[];
}

/**
 * Type guard to check if context is ElementContext
 */
function isElementContext(context: PageContext | ElementContext): context is ElementContext {
  return 'element' in context;
}

/**
 * Inline Chat Window
 * Floating draggable window for chatting with web pages or specific elements
 */
export const InlineChatWindow: React.FC<InlineChatWindowProps> = ({
  onClose,
  initialContext,
  elementPosition,
  onSaveToCanvas,
  anchorElements = []
}) => {
  const defaultPosition = elementPosition
    ? {
        x: Math.min(elementPosition.x + 20, window.innerWidth - 450),
        y: Math.max(20, Math.min(elementPosition.y - 100, window.innerHeight - 600))
      }
    : { x: window.innerWidth - 450, y: 50 };

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 420, height: 550 });
  const [pendingImages, setPendingImages] = useState<Array<{
    dataURL: string;
    width: number;
    height: number;
  }>>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [windowPosition, setWindowPosition] = useState(defaultPosition);
  const [anchorOffset, setAnchorOffset] = useState<{ x: number; y: number } | null>(null);
  const [activeAnchorIndex, setActiveAnchorIndex] = useState(0);
  const [anchorElementMissing, setAnchorElementMissing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>(messages);
  const positionRef = useRef(windowPosition);
  const anchorOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const anchorElementsRef = useRef<HTMLElement[]>(anchorElements);
  const anchorElementRef = useRef<HTMLElement | null>(anchorElements[0] ?? null);
  const activeAnchorIndexRef = useRef(0);
  const isDraggingWindowRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const messageQueueRef = useRef<Message[]>([]);
  const isProcessingQueueRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isUserAnchoredBottom, setIsUserAnchoredBottom] = useState(true);

  // Determine context type
  const isElement = isElementContext(initialContext);
  const contextTitle = isElement
    ? `<${initialContext.element.tagName}>${initialContext.element.id ? `#${initialContext.element.id}` : ''}`
    : initialContext.title;

  const systemPrompt = useMemo(
    () =>
      isElement
        ? formatElementContextAsPrompt(initialContext)
        : formatPageContextAsPrompt(initialContext),
    [isElement, initialContext]
  );

  const isContainerAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return true;
    }

    const { scrollHeight, scrollTop, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= 16;
  }, []);

  const handleMessagesScroll = useCallback(() => {
    setIsUserAnchoredBottom(isContainerAtBottom());
  }, [isContainerAtBottom]);

  const appendSelectionToContext = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return false;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return false;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      return false;
    }

    const isNodeInsideContainer = (node: Node | null): boolean => {
      while (node) {
        if (node === container) {
          return true;
        }
        node = node.parentNode;
      }
      return false;
    };

    const anchorInside = isNodeInsideContainer(selection.anchorNode);
    const focusInside = isNodeInsideContainer(selection.focusNode);

    if (!anchorInside || !focusInside) {
      return false;
    }

    setInputValue(prev => (prev ? `${prev}\n\n${selectedText}` : selectedText));
    selection.removeAllRanges();
    inputRef.current?.focus();
    return true;
  }, [setInputValue]);

  const updateMessages = useCallback((updater: (prev: Message[]) => Message[]) => {
    setMessages(prev => {
      const updated = updater(prev);
      messagesRef.current = updated;
      return updated;
    });
  }, []);

  const insertAssistantAfter = useCallback(
    (userId: string, assistant: Message, userStatus: MessageStatus = 'complete') => {
      updateMessages(prev => {
        const next: Message[] = [];
        let inserted = false;

        for (const msg of prev) {
          if (msg.id === userId) {
            next.push({ ...msg, status: userStatus });
            next.push(assistant);
            inserted = true;
          } else {
            next.push(msg);
          }
        }

        if (!inserted) {
          next.push(assistant);
        }

        return next;
      });
    },
    [updateMessages]
  );

  const processQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) {
      return;
    }

    const nextMessage = messageQueueRef.current[0];
    if (!nextMessage) {
      return;
    }

    isProcessingQueueRef.current = true;
    setIsStreaming(true);

    const snapshot = messagesRef.current;
    const messageIndex = snapshot.findIndex(msg => msg.id === nextMessage.id);
    const conversationSlice = messageIndex >= 0 ? snapshot.slice(0, messageIndex + 1) : snapshot;

    updateMessages(prev =>
      prev.map(msg => (msg.id === nextMessage.id ? { ...msg, status: 'processing' } : msg))
    );

    try {
      if (nextMessage.images && nextMessage.images.length > 0) {
        const { claudeAPIService } = await import('@/services/claudeAPIService');

        const claudeMessages = conversationSlice.map(m => ({
          role: m.role,
          content: m.images && m.images.length > 0
            ? [
                ...m.images.map(img => {
                  const mediaType = img.dataURL.match(/data:([^;]+);/)?.[1] || 'image/png';
                  const base64Data = img.dataURL.split(',')[1];
                  return {
                    type: 'image' as const,
                    source: {
                      type: 'base64' as const,
                      media_type: mediaType,
                      data: base64Data
                    }
                  };
                }),
                { type: 'text' as const, text: m.content }
              ]
            : m.content
        }));

        const response = await claudeAPIService.sendMessage(claudeMessages, {
          system: systemPrompt,
          maxTokens: 4096
        });

        const assistantMessage: Message = {
          id: generateMessageId('assistant'),
          role: 'assistant',
          content: response,
          createdAt: Date.now(),
          linkedTo: nextMessage.id,
          status: 'complete'
        };

        insertAssistantAfter(nextMessage.id, assistantMessage);
      } else {
        const { chatWithPage } = await import('@/services/claudeAPIService');

        let assistantContent = '';
        const stream = await chatWithPage(
          systemPrompt,
          conversationSlice.map(m => ({
            role: m.role,
            content: m.content
          }))
        );

        for await (const chunk of stream) {
          assistantContent += chunk;
          setStreamingContent(assistantContent);
        }

        const assistantMessage: Message = {
          id: generateMessageId('assistant'),
          role: 'assistant',
          content: assistantContent,
          createdAt: Date.now(),
          linkedTo: nextMessage.id,
          status: 'complete'
        };

        insertAssistantAfter(nextMessage.id, assistantMessage);
      }
    } catch (error) {
      console.error('[InlineChatWindow] Error sending message:', error);
      const errorAssistantMessage: Message = {
        id: generateMessageId('assistant'),
        role: 'assistant',
        content:
          '❌ Error: Could not connect to API. Please check your backend is running or API key is configured.',
        createdAt: Date.now(),
        linkedTo: nextMessage.id,
        status: 'error'
      };

      insertAssistantAfter(nextMessage.id, errorAssistantMessage, 'error');
    } finally {
      messageQueueRef.current = messageQueueRef.current.slice(1);
      setStreamingContent('');
      setIsStreaming(false);
      isProcessingQueueRef.current = false;

      if (messageQueueRef.current.length > 0) {
        processQueue();
      }
    }
  }, [insertAssistantAfter, systemPrompt, updateMessages]);

  // Auto-scroll to bottom when messages change only if user is anchored
  useEffect(() => {
    if (!isUserAnchoredBottom) {
      return;
    }

    const raf = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    return () => cancelAnimationFrame(raf);
  }, [messages, streamingContent, isUserAnchoredBottom]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }

      const isModifierPressed = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey;
      if (e.key === 'Enter' && !isModifierPressed) {
        const target = e.target as HTMLElement | null;
        if (target) {
          const isInputTarget = target.tagName === 'TEXTAREA' || target.closest('textarea') || target.isContentEditable;
          if (isInputTarget) {
            return;
          }
        }

        const added = appendSelectionToContext();
        if (added) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, appendSelectionToContext]);

  useEffect(() => {
    positionRef.current = windowPosition;
  }, [windowPosition]);

  useEffect(() => {
    anchorOffsetRef.current = anchorOffset;
  }, [anchorOffset]);

  useEffect(() => {
    anchorElementsRef.current = anchorElements;
    if (anchorElements.length > 0) {
      anchorElementRef.current = anchorElements[activeAnchorIndexRef.current] ?? anchorElements[0];
    }
  }, [anchorElements]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeAnchorIndexRef.current = activeAnchorIndex;
  }, [activeAnchorIndex]);

  const ensureAnchorPosition = useCallback(() => {
    if (anchorElementsRef.current.length === 0) {
      anchorElementRef.current = null;
      if (anchorElementMissing) {
        setAnchorElementMissing(false);
      }
      return;
    }

    const anchors = anchorElementsRef.current.filter(
      (element): element is HTMLElement => element instanceof HTMLElement && document.body.contains(element)
    );

    if (anchors.length === 0) {
      anchorElementRef.current = null;
      if (!anchorElementMissing) {
        setAnchorElementMissing(true);
      }
      return;
    }

    if (anchorElementMissing) {
      setAnchorElementMissing(false);
    }

    let index = activeAnchorIndexRef.current;
    let element = anchors[index];

    if (!element) {
      index = 0;
      element = anchors[0];
    }

    if (!element) {
      return;
    }

    if (anchorElementRef.current !== element) {
      anchorElementRef.current = element;
      if (activeAnchorIndexRef.current !== index) {
        setActiveAnchorIndex(index);
        activeAnchorIndexRef.current = index;
      }
    }

    const rect = element.getBoundingClientRect();

    if (!anchorOffsetRef.current) {
      const offset = {
        x: positionRef.current.x - rect.left,
        y: positionRef.current.y - rect.top
      };
      setAnchorOffset(offset);
      anchorOffsetRef.current = offset;
    }

    if (anchorOffsetRef.current && !isDraggingWindowRef.current) {
      const nextPosition = {
        x: rect.left + anchorOffsetRef.current.x,
        y: rect.top + anchorOffsetRef.current.y
      };

      if (
        Math.abs(nextPosition.x - positionRef.current.x) > 0.5 ||
        Math.abs(nextPosition.y - positionRef.current.y) > 0.5
      ) {
        setWindowPosition(nextPosition);
      }
    }
  }, [anchorElementMissing]);

  useLayoutEffect(() => {
    if (anchorElementsRef.current.length === 0) {
      return;
    }

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

    const mutationObserver = new MutationObserver(handleUpdate);
    mutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true
    });

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      mutationObserver.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [ensureAnchorPosition]);

  useEffect(() => {
    if (anchorElementsRef.current.length > 0) {
      ensureAnchorPosition();
    }
  }, [ensureAnchorPosition]);

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

  const handleImageDrop = async (file: File) => {
    try {
      console.log('[InlineChatWindow] Processing image:', file.name);

      // Validate file is an image
      if (!isImageFile(file)) {
        console.error('[InlineChatWindow] Invalid file type:', file.type);
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

      console.log('[InlineChatWindow] Image added to pending:', dimensions);
    } catch (error) {
      console.error('[InlineChatWindow] Image processing failed:', error);
    }
  };

  // Drag event handlers for file drop
  // Note: We don't use ImageUploadZone wrapper because react-rnd intercepts drag events.
  // Direct handlers on content area ensure preventDefault() executes before browser default.
  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only handle file drags
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsDraggingFile(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only reset if leaving the content area entirely
    if (e.currentTarget === e.target) {
      setIsDraggingFile(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      console.warn('[InlineChatWindow] No image files found in drop');
      return;
    }

    // Process first image file
    await handleImageDrop(imageFiles[0]);
  }, [handleImageDrop]);

  const handleSendMessage = () => {
    if (!inputValue.trim() && pendingImages.length === 0) {
      return;
    }

    const userMessage: Message = {
      id: generateMessageId('user'),
      role: 'user',
      content: inputValue.trim() || '(Image attached)',
      images: pendingImages.length > 0 ? [...pendingImages] : undefined,
      status: 'queued',
      createdAt: Date.now()
    };

    setInputValue('');
    setPendingImages([]);

    updateMessages(prev => [...prev, userMessage]);
    messageQueueRef.current = [...messageQueueRef.current, userMessage];
    processQueue();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleRecapture = () => {
    const newContext = capturePageContext();
    console.log('[InlineChatWindow] Recaptured page context:', newContext.title);
    // For now, just log. In the future, we could update the context
  };

  const handleSave = async () => {
    if (onSaveToCanvas && messages.length > 0) {
      await onSaveToCanvas(messages);
      onClose();
    }
  };

  const handleDragStart = () => {
    isDraggingWindowRef.current = true;
  };

  const handleDragStop = (_event: unknown, data: DraggableData) => {
    isDraggingWindowRef.current = false;
    setWindowPosition({ x: data.x, y: data.y });

    if (anchorElementRef.current) {
      const rect = anchorElementRef.current.getBoundingClientRect();
      const offset = {
        x: data.x - rect.left,
        y: data.y - rect.top,
      };
      setAnchorOffset(offset);
      anchorOffsetRef.current = offset;
    } else {
      setAnchorOffset(null);
      anchorOffsetRef.current = null;
    }
  };

  const handleResizeStart = () => {
    isDraggingWindowRef.current = true;
  };

  const handleResizeStop = (
    _event: unknown,
    _direction: unknown,
    ref: HTMLElement,
    _delta: { width: number; height: number },
    position: { x: number; y: number }
  ) => {
    isDraggingWindowRef.current = false;
    setWindowSize({
      width: parseInt(ref.style.width, 10),
      height: parseInt(ref.style.height, 10),
    });
    setWindowPosition(position);

    if (anchorElementRef.current) {
      const rect = anchorElementRef.current.getBoundingClientRect();
      const offset = {
        x: position.x - rect.left,
        y: position.y - rect.top,
      };
      setAnchorOffset(offset);
      anchorOffsetRef.current = offset;
    }
  };

  const headerOnlyHeight = 52;

  const primaryContextLabel = isElement
    ? `<${initialContext.element.tagName}>${initialContext.element.id ? `#${initialContext.element.id}` : ''}`
    : initialContext.title;

  const secondaryContextLabel = isElement && initialContext.element.classes.length > 0
    ? `.${initialContext.element.classes.slice(0, 2).join('.')}${initialContext.element.classes.length > 2 ? '…' : ''}`
    : '';

  return (
    <Rnd
      position={windowPosition}
      size={{
        width: windowSize.width,
        height: collapsed ? headerOnlyHeight : windowSize.height
      }}
      onDragStart={handleDragStart}
      onDragStop={handleDragStop}
      onResizeStart={handleResizeStart}
      onResizeStop={handleResizeStop}
      minWidth={320}
      minHeight={220}
      bounds="window"
      dragHandleClassName="drag-handle"
      enableResizing={!collapsed && {
        bottom: true,
        bottomRight: true,
        bottomLeft: true,
        right: true,
        left: true,
        top: false,
        topRight: false,
        topLeft: false
      }}
    >
      <div css={containerStyles(collapsed, windowSize.width, windowSize.height)}>
        <div css={headerStyles} className="drag-handle">
          <div css={headerTitleStyles}>
            <span css={iconStyles}>{isElement ? '🎯' : '💬'}</span>
            <div css={headerTextGroupStyles}>
              <span css={headerPrimaryTextStyles}>{isElement ? 'Element Chat' : 'Page Chat'}</span>
              <span css={headerContextStyles}>
                {primaryContextLabel}
                {secondaryContextLabel && (
                  <span css={headerContextSecondaryStyles}>{secondaryContextLabel}</span>
                )}
              </span>
            </div>
          </div>
          <div css={headerActionsStyles}>
            <button
              css={headerButtonStyles}
              onClick={handleRecapture}
              title="Refresh page context"
            >
              📋
            </button>
            {onSaveToCanvas && (
              <button
                css={headerButtonStyles}
                onClick={handleSave}
                title="Save conversation to canvas"
                disabled={messages.length === 0}
              >
                📌
              </button>
            )}
            <button
              css={headerButtonStyles}
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expand' : 'Collapse to header'}
            >
              {collapsed ? '▼' : '▲'}
            </button>
            <button
              css={headerButtonStyles}
              onClick={onClose}
              title="Close chat"
            >
              ✕
            </button>
          </div>
        </div>
        {!collapsed && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            css={contentWrapperStyles}
          >
            {anchorElementMissing && (
              <div css={anchorWarningStyles}>
                📍 Element moved off-screen. Drag the window to reposition.
              </div>
            )}
            {isDraggingFile && (
              <div css={dragOverlayStyles}>
                <div css={dragOverlayContentStyles}>
                  <div style={{ fontSize: 48 }}>📁</div>
                  <div>Drop image to upload</div>
                </div>
              </div>
            )}
            <div
              css={messagesContainerStyles}
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              data-testid="inline-chat-messages"
            >
              {messages.length === 0 ? (
                <div css={emptyStateStyles}>
                  <div css={emptyIconStyles}>{isElement ? '🎯' : '💬'}</div>
                  <div css={emptyTitleStyles}>
                    {isElement ? 'Chat about this element' : 'Chat with this page'}
                  </div>
                  <div css={emptyDescStyles}>
                    {isElement
                      ? 'Ask questions about this element, its purpose, or how it works.'
                      : 'Ask questions, request summaries, or discuss the content on this page.'}
                  </div>
                  <div css={emptyHintStyles}>
                    <strong>{isElement ? 'Element' : 'Page'}:</strong> {contextTitle}
                  </div>
                  {isElement && initialContext.element.text && (
                    <div css={emptyHintStyles} style={{ marginTop: '8px' }}>
                      <strong>Text:</strong>{' '}
                      {initialContext.element.text.substring(0, 120)}
                      {initialContext.element.text.length > 120 ? '…' : ''}
                    </div>
                  )}
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} css={messageStyles(message.role)}>
                    <div css={messageRoleStyles}>
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    {message.images && message.images.length > 0 && (
                      <div css={messageImagesStyles}>
                        {message.images.map((img, idx) => (
                          <img
                            key={idx}
                            src={img.dataURL}
                            css={messageImageStyles}
                            alt={`Attached image ${idx + 1}`}
                          />
                        ))}
                      </div>
                    )}
                    <div css={messageContentStyles} data-testid="inline-chat-message-text">
                      {renderMarkdown(message.content)}
                    </div>
                  </div>
                ))
              )}
              {isStreaming && streamingContent && (
                <div css={messageStyles('assistant')}>
                  <div css={messageRoleStyles}>Assistant</div>
                  <div css={messageContentStyles}>
                    {renderMarkdown(streamingContent)}
                    <span css={cursorStyles}>▊</span>
                  </div>
                </div>
              )}
              {isStreaming && !streamingContent && (
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
            {pendingImages.length > 0 && (
              <div css={imagePreviewContainerStyles}>
                {pendingImages.map((img, idx) => (
                  <div key={idx} css={imagePreviewStyles}>
                    <img src={img.dataURL} css={thumbnailStyles} alt={`Pending image ${idx + 1}`} />
                    <button
                      onClick={() =>
                        setPendingImages(prev => prev.filter((_, i) => i !== idx))
                      }
                      css={removeImageButtonStyles}
                      title="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div css={inputContainerStyles}>
              <textarea
                ref={inputRef}
                css={textareaStyles}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={isElement ? 'Ask about this element…' : 'Ask about this page…'}
                rows={2}
              />
              <button
                css={sendButtonStyles}
                onClick={handleSendMessage}
                disabled={!inputValue.trim() && pendingImages.length === 0}
                data-testid="inline-chat-send"
              >
                ➤
              </button>
            </div>
          </div>
        )}
      </div>
    </Rnd>
  );
};

// ============================================================================
// Styles
// ============================================================================

const containerStyles = (collapsed: boolean, width: number, height: number) => css`
  width: 100%;
  height: 100%;
  background: #fdf8f6;
  border: 1px solid rgba(178, 60, 60, 0.55);
  border-radius: 12px;
  box-shadow: 0 18px 38px rgba(170, 34, 34, 0.16);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  transition: height 0.25s ease;
  overflow: hidden;
`;

const headerStyles = css`
  background: linear-gradient(135deg, #b23232, #a32020);
  color: #fff8f6;
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
  user-select: none;
  flex-shrink: 0;
`;

const headerTitleStyles = css`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const headerTextGroupStyles = css`
  display: flex;
  flex-direction: column;
  line-height: 1.1;
`;

const headerPrimaryTextStyles = css`
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.15px;
`;

const headerContextStyles = css`
  font-size: 11px;
  color: rgba(255, 240, 240, 0.85);
  display: flex;
  align-items: baseline;
  gap: 6px;
`;

const headerContextSecondaryStyles = css`
  font-size: 10px;
  color: rgba(255, 240, 240, 0.65);
`;

const iconStyles = css`
  font-size: 18px;
`;

const headerActionsStyles = css`
  display: flex;
  gap: 8px;
`;

const headerButtonStyles = css`
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 230, 230, 0.35);
  border-radius: 6px;
  padding: 4px 10px;
  color: #fff6f4;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.26);
    border-color: rgba(255, 255, 255, 0.45);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const contentWrapperStyles = css`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: #f7efed;
`;

const anchorWarningStyles = css`
  background: rgba(198, 70, 70, 0.12);
  border: 1px solid rgba(198, 70, 70, 0.38);
  color: #9b2e2e;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const messagesContainerStyles = css`
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  background: #ffffff;
  border: 1px solid rgba(177, 60, 60, 0.2);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(177, 60, 60, 0.08);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(177, 60, 60, 0.35);
    border-radius: 3px;

    &:hover {
      background: rgba(177, 60, 60, 0.48);
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
  padding: 24px;
  color: #7a4d4d;
`;

const emptyIconStyles = css`
  font-size: 48px;
  margin-bottom: 14px;
  opacity: 0.75;
`;

const emptyTitleStyles = css`
  font-size: 18px;
  font-weight: 600;
  color: #a32020;
  margin-bottom: 8px;
`;

const emptyDescStyles = css`
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 14px;
`;

const emptyHintStyles = css`
  font-size: 12px;
  color: #8a5b5b;
  padding: 8px 12px;
  background: rgba(177, 60, 60, 0.08);
  border-radius: 8px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const messageStyles = (role: 'user' | 'assistant') => css`
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid ${role === 'user' ? 'rgba(177, 50, 50, 0.35)' : 'rgba(161, 44, 44, 0.22)'};
  background: ${role === 'user'
    ? 'linear-gradient(135deg, rgba(177, 50, 50, 0.12), rgba(177, 50, 50, 0.04))'
    : 'rgba(161, 44, 44, 0.06)'};
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-self: ${role === 'user' ? 'flex-end' : 'flex-start'};
  max-width: 100%;
  width: fit-content;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
`;

const messageRoleStyles = css`
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.45px;
  color: #a12323;
`;

const messageContentStyles = css`
  color: #2c1f1f;
  word-break: break-word;

  p {
    margin: 0 0 8px 0;
  }

  ul,
  ol {
    margin: 0 0 8px 20px;
    padding: 0;
  }

  li {
    margin-bottom: 4px;
  }

  code {
    background: rgba(161, 44, 44, 0.12);
    padding: 2px 5px;
    border-radius: 4px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 12px;
  }

  pre {
    background: rgba(177, 50, 50, 0.08);
    padding: 10px;
    border-radius: 8px;
    overflow-x: auto;
    border: 1px solid rgba(177, 50, 50, 0.18);
  }

  a {
    color: #a32020;
    text-decoration: underline;
  }
`;

const cursorStyles = css`
  animation: blink 1s infinite;
  color: #b23232;

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
    background: #b13232;
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
  display: flex;
  gap: 10px;
  background: #f1f1f1;
  border: 1px solid rgba(177, 60, 60, 0.18);
  border-radius: 10px;
  padding: 10px 12px;
  flex-shrink: 0;
`;

const textareaStyles = css`
  flex: 1;
  border: 1px solid rgba(150, 70, 70, 0.35);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  line-height: 1.45;
  background: #f7f6f5;
  color: #2c1f1f;

  &:focus {
    outline: none;
    border-color: #b23232;
    box-shadow: 0 0 0 2px rgba(178, 50, 50, 0.15);
  }

  &:disabled {
    background: rgba(0, 0, 0, 0.05);
    cursor: not-allowed;
    color: rgba(0, 0, 0, 0.35);
  }
`;

const sendButtonStyles = css`
  background: linear-gradient(135deg, #b23232, #a32020);
  color: #fff8f6;
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(178, 50, 50, 0.32);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

// ============================================================================
// Image Upload Styles
// ============================================================================

const imagePreviewContainerStyles = css`
  display: flex;
  gap: 10px;
  padding: 8px;
  background: rgba(177, 60, 60, 0.08);
  border: 1px solid rgba(177, 60, 60, 0.18);
  border-radius: 10px;
  flex-wrap: wrap;
  max-height: 120px;
  overflow-y: auto;
  flex-shrink: 0;

  &::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(177, 60, 60, 0.08);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(177, 60, 60, 0.35);
    border-radius: 2px;

    &:hover {
      background: rgba(177, 60, 60, 0.48);
    }
  }
`;

const imagePreviewStyles = css`
  position: relative;
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(177, 60, 60, 0.25);
`;

const thumbnailStyles = css`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const removeImageButtonStyles = css`
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #b23232;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: 0 4px 8px rgba(178, 50, 50, 0.2);
  transition: all 0.2s ease;

  &:hover {
    background: #c74646;
    transform: scale(1.08);
  }
`;

const messageImagesStyles = css`
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
`;

const messageImageStyles = css`
  max-width: 200px;
  max-height: 200px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid rgba(177, 60, 60, 0.25);
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(177, 60, 60, 0.15);
`;

// ============================================================================
// Drag Overlay Styles
// ============================================================================

const dragOverlayStyles = css`
  position: absolute;
  inset: 0;
  background: rgba(177, 50, 50, 0.88);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  pointer-events: none;
  border-radius: 10px;
`;

const dragOverlayContentStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #fff6f4;
  font-size: 20px;
  font-weight: 600;
  text-shadow: 0 2px 8px rgba(120, 16, 16, 0.4);
`;
