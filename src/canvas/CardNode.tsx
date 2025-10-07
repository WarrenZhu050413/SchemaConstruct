import React, { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeResizer, useNodeId, useStore } from '@xyflow/react';
import type { Card } from '@/types/card';
import DOMPurify from 'isomorphic-dompurify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { windowManager } from '@/services/windowManager';
import { saveCard } from '@/utils/storage';
import { ContextInputModal } from '@/components/ContextInputModal';
import { Toast, ToastType } from '@/components/Toast';
import { cardGenerationService } from '@/services/cardGenerationService';
import { beautificationService } from '@/services/beautificationService';
import { DEFAULT_BUTTONS } from '@/config/defaultButtons';
import type { CardButton } from '@/types/button';
import type { BeautificationMode } from '@/types/card';
import { useLLMHyperlinks } from './useLLMHyperlinks';
import { GenerateChildModal } from '@/components/GenerateChildModal';
import { stashCard } from '@/sidepanel/stashService';
import { FillInModal } from '@/components/FillInModal';
import { getConnectionCount } from '@/services/connectionContextService';
import type { FillInStrategy } from '@/types/card';
import { useButtons } from './useButtons';
import { ButtonSettings } from '@/components/ButtonSettings';
import { OverflowMenu } from '@/components/OverflowMenu';
import { useFontSize } from '@/shared/hooks/useFontSize';

// Add CSS animation for skeleton pulsing
if (typeof document !== 'undefined' && !document.getElementById('skeleton-animation')) {
  const style = document.createElement('style');
  style.id = 'skeleton-animation';
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
}

interface CardNodeProps {
  data: {
    card: Card;
  };
}

export const CardNode = memo(({ data }: CardNodeProps) => {
  const card = data?.card;
  const nodeId = useNodeId();

  // Get current node dimensions from React Flow store
  const nodeSize = useStore((store) => {
    const node = store.nodes.find(n => n.id === nodeId);
    if (!node?.measured) return null;
    return {
      width: node.measured.width || 320,
      height: node.measured.height || 240,
    };
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [showContextModal, setShowContextModal] = useState(false);
  const [selectedButton, setSelectedButton] = useState<CardButton | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [showBeautifyMenu, setShowBeautifyMenu] = useState(false);
  const [isBeautifying, setIsBeautifying] = useState(false);
  const [showFillInModal, setShowFillInModal] = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [showButtonSettings, setShowButtonSettings] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const contentEditRef = useRef<HTMLTextAreaElement>(null);
  const titleEditRef = useRef<HTMLInputElement>(null);
  const generationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const beautifyWrapperRef = useRef<HTMLDivElement | null>(null);

  if (!card) {
    return null;
  }

  // LLM-Generated Hyperlinks hook
  const llmHyperlinks = useLLMHyperlinks({
    card,
    onToast: (message, type) => {
      setToast({ message, type });
      if (type !== 'loading') {
        setTimeout(() => setToast(null), type === 'error' ? 5000 : 3000);
      }
    },
  });

  // Load buttons (default + custom)
  const { enabledButtons } = useButtons();

  // Load font size preference
  const { fontSizeValues } = useFontSize();

  // Generate dynamic styles based on font size
  const styles = getStyles(fontSizeValues);

  // Load connection count for Fill-In feature
  useEffect(() => {
    async function loadConnectionCount() {
      try {
        const count = await getConnectionCount(card.id);
        setConnectionCount(count);
      } catch (error) {
        console.error('[CardNode] Error loading connection count:', error);
      }
    }
    loadConnectionCount();

    // Listen for connection updates
    const handleConnectionUpdate = () => {
      loadConnectionCount();
    };
    window.addEventListener('nabokov:cards-updated', handleConnectionUpdate);
    return () => {
      window.removeEventListener('nabokov:cards-updated', handleConnectionUpdate);
    };
  }, [card.id]);

  useEffect(() => {
    if (!showBeautifyMenu) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!beautifyWrapperRef.current) {
        return;
      }
      if (!beautifyWrapperRef.current.contains(event.target as Node)) {
        setShowBeautifyMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showBeautifyMenu]);

  // Keyboard shortcut: Cmd+Shift+F for Fill-In
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault();
        if (connectionCount > 0) {
          setShowFillInModal(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectionCount]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Sanitize HTML content (if exists - image cards may not have content)
  // Use beautified content if available, otherwise use original content
  const contentToDisplay = card.beautifiedContent || card.content;
  const sanitizedContent = contentToDisplay
    ? DOMPurify.sanitize(contentToDisplay, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'u', 'a', 'span', 'div',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li',
          'article', 'section', 'header', 'footer', 'nav', 'aside',
          'blockquote', 'pre', 'code'
        ],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class', 'id'],
      })
    : '';

  // Extract plain text for preview
  const getTextPreview = () => {
    if (!sanitizedContent) return '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sanitizedContent;
    const text = tempDiv.textContent || tempDiv.innerText || '';
    return truncateText(text, 200);
  };

  const handleOpenWindow = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node drag
    windowManager.openWindow(card);
  };

  const handleToggleCollapse = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node drag

    try {
      const updatedCard: Card = {
        ...card,
        collapsed: !card.collapsed,
        updatedAt: Date.now(),
      };

      await saveCard(updatedCard);

      // Dispatch event to refresh cards
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));
    } catch (error) {
      console.error('[CardNode] Error toggling collapse:', error);
    }
  };

  const handleStash = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node drag

    try {
      await stashCard(card.id);
      setToast({ message: 'Card stashed to Side Panel', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('[CardNode] Error stashing card:', error);
      setToast({ message: 'Failed to stash card', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleOpenFillIn = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node drag

    try {
      // Load all cards from storage
      const result = await chrome.storage.local.get('cards');
      const cards: Card[] = result.cards || [];
      setAllCards(cards);
      setShowFillInModal(true);
    } catch (error) {
      console.error('[CardNode] Error loading cards for fill-in:', error);
      setToast({ message: 'Failed to load cards', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleFillInAccept = async (
    content: string,
    sourceCardIds: string[],
    strategy: FillInStrategy,
    userGuidance?: string
  ) => {
    try {
      // Apply strategy-specific content transformation
      let finalContent = content;
      if (strategy === 'append' && card.content) {
        finalContent = `${card.content}\n\n---\n\n${content}`;
      } else if (strategy === 'merge' && card.content) {
        // For merge, the LLM already handled the merging, just use generated content
        finalContent = content;
      }
      // For 'replace', just use the generated content as-is

      // Create fill-in history entry
      const historyEntry = {
        timestamp: Date.now(),
        sourceCardIds,
        strategy,
        userPrompt: userGuidance,
        previousContent: card.content,
      };

      const updatedCard: Card = {
        ...card,
        content: finalContent,
        fillInHistory: [...(card.fillInHistory || []), historyEntry],
        updatedAt: Date.now(),
      };

      await saveCard(updatedCard);
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));

      setToast({ message: `Card filled in using ${strategy} strategy`, type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('[CardNode] Error accepting fill-in:', error);
      setToast({ message: 'Failed to save filled-in content', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleBeautify = async (mode: BeautificationMode) => {
    try {
      setToast({
        message: 'Beautifying content (Organize Content)...',
        type: 'loading',
      });

      await beautificationService.beautifyCard(card.id, mode);

      setToast({
        message: 'Content beautified! ✨',
        type: 'success',
      });

      setTimeout(() => {
        setToast(null);
      }, 3000);
    } catch (error) {
      console.error('[CardNode] Error beautifying card:', error);
      setToast({
        message: `Failed to beautify: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });

      setTimeout(() => {
        setToast(null);
      }, 5000);
    } finally {
      setIsBeautifying(false);
      setShowBeautifyMenu(false);
    }
  };

  const startBeautification = (mode: BeautificationMode, options?: { openMenu?: boolean }) => {
    if (isBeautifying) {
      return;
    }

    if (options?.openMenu) {
      setShowBeautifyMenu(true);
    }

    setIsBeautifying(true);
    void handleBeautify(mode);
  };

  const handleRevertBeautification = async () => {
    try {
      setShowBeautifyMenu(false);
      setIsBeautifying(true);

      setToast({
        message: 'Reverting to original content...',
        type: 'loading',
      });

      await beautificationService.revertBeautification(card.id);

      setToast({
        message: 'Reverted to original content',
        type: 'success',
      });

      setTimeout(() => {
        setToast(null);
      }, 3000);
    } catch (error) {
      console.error('[CardNode] Error reverting beautification:', error);
      setToast({
        message: `Failed to revert: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });

      setTimeout(() => {
        setToast(null);
      }, 5000);
    } finally {
      setIsBeautifying(false);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Extract plain text from HTML content while preserving newlines
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sanitizedContent;

    // Convert <br> tags to newlines and <p> tags to double newlines
    // This preserves the structure when editing
    let htmlWithNewlines = tempDiv.innerHTML;
    htmlWithNewlines = htmlWithNewlines.replace(/<br\s*\/?>/gi, '\n');
    htmlWithNewlines = htmlWithNewlines.replace(/<\/p>\s*<p>/gi, '\n\n');
    htmlWithNewlines = htmlWithNewlines.replace(/<\/?p>/gi, '');

    tempDiv.innerHTML = htmlWithNewlines;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';

    setEditContent(plainText);
    setEditTitle(card.metadata.title);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    try {
      // Convert plain text to HTML with paragraphs
      const htmlContent = editContent
        .split('\n\n')
        .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
        .join('');

      const updatedCard: Card = {
        ...card,
        content: htmlContent,
        metadata: {
          ...card.metadata,
          title: editTitle,
        },
        // CRITICAL FIX: Preserve position and size
        position: card.position,
        size: card.size,
        updatedAt: Date.now(),
      };

      await saveCard(updatedCard);
      setIsEditing(false);

      // Dispatch event to refresh cards
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));
    } catch (error) {
      console.error('[CardNode] Error saving edits:', error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent('');
    setEditTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSaveEdit();
    }
  };

  // Focus content editor when entering edit mode
  useEffect(() => {
    if (isEditing && contentEditRef.current) {
      contentEditRef.current.focus();
      contentEditRef.current.select();
    }
  }, [isEditing]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
      }
    };
  }, []);

  const handleButtonClick = (button: CardButton) => {
    setSelectedButton(button);
    setShowContextModal(true);
  };

  const handleContextSubmit = async (context: string) => {
    if (!selectedButton) return;

    // Close modal first
    setShowContextModal(false);
    setSelectedButton(null);

    // Show loading toast
    setToast({
      message: `Generating "${selectedButton.label}" card...`,
      type: 'loading',
    });

    // Set timeout for generation (15 seconds)
    generationTimeoutRef.current = setTimeout(() => {
      setToast({
        message: 'Card generation is taking longer than expected. Please wait...',
        type: 'info',
      });
    }, 15000);

    try {
      // Generate new card from button action
      await cardGenerationService.generateCardFromButton(card, selectedButton, context);

      // Clear timeout
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
        generationTimeoutRef.current = null;
      }

      // Show success toast
      setToast({
        message: 'Card generated successfully! ✨',
        type: 'success',
      });

      // Auto-close success toast after 3 seconds
      setTimeout(() => {
        setToast(null);
      }, 3000);

      // Dispatch event to refresh cards
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));
    } catch (error) {
      console.error('[CardNode] Error generating card:', error);

      // Clear timeout
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
        generationTimeoutRef.current = null;
      }

      // Show error toast
      setToast({
        message: `Failed to generate card: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });

      // Auto-close error toast after 5 seconds
      setTimeout(() => {
        setToast(null);
      }, 5000);
    }
  };

  const handleContextCancel = () => {
    setShowContextModal(false);
    setSelectedButton(null);
  };

  const handleToggleStar = async () => {
    try {
      const updatedCard: Card = {
        ...card,
        starred: !card.starred,
        // Preserve current node size from React Flow (in case it was resized but not yet saved due to debounce)
        size: nodeSize || card.size || { width: 320, height: 240 },
        updatedAt: Date.now(),
      };

      await saveCard(updatedCard);
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));
    } catch (error) {
      console.error('[CardNode] Error toggling star:', error);
    }
  };

  if (isEditing) {
    return (
      <div style={styles.card} onKeyDown={handleKeyDown}>
        {/* Edit Mode Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            {card.metadata.favicon && (
              <span style={styles.favicon}>
                {card.metadata.favicon}
              </span>
            )}
            <div style={{
              ...styles.domain,
              ...(card.cardType === 'note' ? styles.noteDomain : {}),
              ...(card.cardType === 'hypertext' ? {
                background: 'linear-gradient(135deg, rgba(177, 50, 50, 0.1), rgba(212, 175, 55, 0.1))',
                border: '1px solid rgba(177, 50, 50, 0.25)',
                color: '#8B0000',
                fontWeight: 600,
              } : {}),
            }}>
              {card.cardType === 'hypertext' ? '💡 Hypertext' : card.metadata.domain}
            </div>
          </div>
          <div style={styles.editButtons}>
            <button
              onClick={handleSaveEdit}
              style={styles.saveButton}
              title="Save (Cmd+Enter)"
            >
              ✓
            </button>
            <button
              onClick={handleCancelEdit}
              style={styles.cancelButton}
              title="Cancel (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Editable Title */}
        <input
          ref={titleEditRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          style={styles.titleEdit}
          placeholder="Card title..."
        />

        {/* Editable Content */}
        <textarea
          ref={contentEditRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          style={styles.contentEdit}
          placeholder="Card content..."
          onWheel={(e) => {
            // Prevent scroll from bubbling to canvas
            const target = e.currentTarget;
            const canScrollDown = target.scrollTop < target.scrollHeight - target.clientHeight;
            const canScrollUp = target.scrollTop > 0;
            const isScrollingDown = e.deltaY > 0;
            const isScrollingUp = e.deltaY < 0;

            if ((isScrollingDown && canScrollDown) || (isScrollingUp && canScrollUp)) {
              e.stopPropagation();
            }
          }}
        />

        {/* Footer with hints */}
        <div style={styles.editFooter}>
          <div style={styles.editHint}>Cmd+Enter to save, Esc to cancel</div>
        </div>

        {/* Handles for connections */}
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
        <Handle
          type="target"
          position={Position.Left}
          style={{ opacity: 0, pointerEvents: 'none' }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...styles.card,
        ...(card.collapsed ? styles.cardCollapsed : {}),
      }}
      onDoubleClick={handleDoubleClick}
      data-card-id={card.id}
    >
      {/* Resize Handle - bottom-right corner */}
      {!card.collapsed && (
        <NodeResizer
          minWidth={200}
          minHeight={150}
          handleStyle={{
            width: '12px',
            height: '12px',
            borderRadius: '0 0 12px 0',
          }}
          lineStyle={{
            borderColor: 'rgba(139, 0, 0, 0.3)',
            borderWidth: '2px',
          }}
        />
      )}

      {/* Header - Clean with only collapse button */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {card.metadata.favicon && (
            <span style={styles.favicon}>
              {card.metadata.favicon}
            </span>
          )}
          <div style={{
            ...styles.domain,
            ...(card.cardType === 'note' ? styles.noteDomain : {}),
            ...(card.cardType === 'hypertext' ? {
              background: 'linear-gradient(135deg, rgba(177, 50, 50, 0.1), rgba(212, 175, 55, 0.1))',
              border: '1px solid rgba(177, 50, 50, 0.25)',
              color: '#8B0000',
              fontWeight: 600,
            } : {}),
          }}>
            {card.cardType === 'hypertext' ? '💡 Hypertext' : card.metadata.domain}
          </div>
        </div>
        <div style={styles.headerRight}>
          <button
            onClick={handleToggleCollapse}
            style={styles.collapseButton}
            title={card.collapsed ? 'Expand card' : 'Collapse card'}
            data-testid="collapse-btn"
          >
            {card.collapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {/* Overflow Menu */}
      <OverflowMenu
        card={card}
        isOpen={showOverflowMenu}
        onClose={() => setShowOverflowMenu(false)}
        onBeautify={() => {
          startBeautification('organize-content', { openMenu: true });
        }}
        onFillIn={(e) => handleOpenFillIn(e as React.MouseEvent)}
        onOpenWindow={(e) => handleOpenWindow(e as React.MouseEvent)}
        onStash={(e) => handleStash(e as React.MouseEvent)}
        onToggleStar={handleToggleStar}
        onButtonSettings={() => setShowButtonSettings(true)}
        connectionCount={connectionCount}
      />

      {/* Title - Single line */}
      <div style={{
        ...styles.title,
        ...(card.collapsed ? styles.titleCollapsed : {}),
      }}>
        {truncateText(card.metadata.title, 100)}
      </div>

      {/* Content - Only shown when not collapsed */}
      {!card.collapsed && (
        <>
          {/* Image Card: Display Image */}
          {card.cardType === 'image' && card.imageData ? (
            <div style={styles.imageContainer} onDoubleClick={handleDoubleClick}>
              <img
                src={card.imageData}
                alt={card.metadata.title}
                style={styles.image}
              />
            </div>
          ) : (
            /* Content with Markdown rendering - Maximum space! */
            <div
              className="card-content-scrollable"
              style={{
                ...styles.content,
                ...(card.isGenerating ? styles.contentGenerating : {}),
              }}
              onDoubleClick={handleDoubleClick}
              onWheel={(e) => {
                // Prevent scroll from bubbling to canvas (which would zoom)
                const target = e.currentTarget;
                const canScrollDown = target.scrollTop < target.scrollHeight - target.clientHeight;
                const canScrollUp = target.scrollTop > 0;
                const isScrollingDown = e.deltaY > 0;
                const isScrollingUp = e.deltaY < 0;

                if ((isScrollingDown && canScrollDown) || (isScrollingUp && canScrollUp)) {
                  e.stopPropagation();
                }
              }}
            >
              {/* Show skeleton UI when generating */}
              {card.isGenerating ? (
                <div style={styles.skeletonContainer}>
                  <div style={styles.skeletonLine} />
                  <div style={styles.skeletonLine} />
                  <div style={{...styles.skeletonLine, width: '60%'}} />
                  <div style={{...styles.skeletonLine, width: '80%', marginTop: '16px'}} />
                  <div style={styles.skeletonLine} />
                  <div style={{...styles.skeletonLine, width: '70%'}} />
                  <div style={styles.skeletonText}>✨ Generating content...</div>
                </div>
              ) : (
                <>
                  {/* Render markdown if beautified, otherwise show HTML or text */}
                  {card.beautifiedContent ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({node, ...props}) => <h2 style={styles.markdownH1} {...props} />,
                        h2: ({node, ...props}) => <h3 style={styles.markdownH2} {...props} />,
                        h3: ({node, ...props}) => <h4 style={styles.markdownH3} {...props} />,
                        p: ({node, ...props}) => <p style={styles.markdownP} {...props} />,
                        ul: ({node, ...props}) => <ul style={styles.markdownUl} {...props} />,
                        ol: ({node, ...props}) => <ol style={styles.markdownOl} {...props} />,
                        li: ({node, ...props}) => <li style={styles.markdownLi} {...props} />,
                        table: ({node, ...props}) => <table style={styles.markdownTable} {...props} />,
                        th: ({node, ...props}) => <th style={styles.markdownTh} {...props} />,
                        td: ({node, ...props}) => <td style={styles.markdownTd} {...props} />,
                        strong: ({node, ...props}) => <strong style={styles.markdownStrong} {...props} />,
                        code: ({node, ...props}) => <code style={styles.markdownCode} {...props} />,
                      }}
                    >
                      {card.beautifiedContent}
                    </ReactMarkdown>
                  ) : (
                    <div
                      style={styles.contentHTML}
                      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* Enhanced Footer with visible action buttons */}
          {card.cardType !== 'image' && card.content && !card.isGenerating && (
            <div style={styles.footer}>
              <div style={styles.footerLeft}>
                {/* Chat Button */}
                <button
                  onClick={handleOpenWindow}
                  style={styles.chatButton}
                  title={card.cardType === 'generated' ? 'Continue chatting with this card' : 'Chat about this card'}
                  data-testid="chat-btn"
                >
                  💬
                </button>

                {/* Star Button */}
                <button
                  onClick={handleToggleStar}
                  style={{...styles.iconButton, ...(card.starred ? styles.iconButtonActive : {})}}
                  title={card.starred ? 'Unstar' : 'Star'}
                  data-testid="star-btn"
                >
                  {card.starred ? '⭐' : '☆'}
                </button>
              </div>

              <div style={styles.footerCenter}>
                {/* Beautify Button */}
                <div style={styles.beautifyButtonWrapper} ref={beautifyWrapperRef}>
                  <button
                    onClick={() => {
                      startBeautification('organize-content', { openMenu: true });
                    }}
                    style={{
                      ...styles.iconButton,
                      ...(card.beautifiedContent ? styles.iconButtonActive : {}),
                      ...(isBeautifying ? styles.iconButtonDisabled : {}),
                    }}
                    title={isBeautifying ? 'Beautifying in progress...' : 'Beautify Content'}
                    data-testid="beautify-btn"
                    disabled={isBeautifying}
                    aria-label="Beautify Content"
                    aria-disabled={isBeautifying}
                    aria-busy={isBeautifying}
                  >
                    {isBeautifying ? '⏳' : '✨'}
                  </button>

                  {showBeautifyMenu && (
                    <div
                      style={styles.beautifyMenu}
                      role="menu"
                      data-testid="beautify-menu"
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <div style={styles.beautifyMenuHeader}>Beautify Options</div>
                      <button
                        type="button"
                        style={styles.beautifyMenuButton}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          startBeautification('organize-content');
                        }}
                        role="menuitem"
                      >
                        Organize Content
                      </button>
                      {card.beautifiedContent && (
                        <button
                          type="button"
                          style={styles.beautifyMenuButton}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleRevertBeautification();
                          }}
                          role="menuitem"
                        >
                          Revert Beautification
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Fill-In Button - only if connections exist */}
                {connectionCount > 0 && (
                  <button
                    onClick={handleOpenFillIn}
                    style={styles.iconButton}
                    title={`Fill-In (${connectionCount} connection${connectionCount !== 1 ? 's' : ''})`}
                    data-testid="fill-in-btn"
                  >
                    🔗
                  </button>
                )}

                {/* Stash Button */}
                <button
                  onClick={handleStash}
                  style={styles.iconButton}
                  title="Stash to Side Panel"
                  data-testid="stash-btn"
                >
                  📥
                </button>
              </div>

              <div style={styles.footerRight}>
                {/* Custom Action Buttons - Show first 2 */}
                {enabledButtons.slice(0, 2).map(button => (
                  <button
                    key={button.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleButtonClick(button);
                    }}
                    style={styles.iconButton}
                    title={button.label}
                    data-testid={`action-btn-${button.id}`}
                  >
                    {button.icon}
                  </button>
                ))}

                {/* Minimal Overflow Menu - only for rare actions */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOverflowMenu(!showOverflowMenu);
                  }}
                  style={styles.iconButton}
                  title="More options"
                  data-testid="overflow-btn-footer"
                >
                  ⋯
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Context Input Modal */}
      {showContextModal && selectedButton && (
        <ContextInputModal
          buttonLabel={selectedButton.label}
          buttonIcon={selectedButton.icon}
          onSubmit={handleContextSubmit}
          onCancel={handleContextCancel}
        />
      )}

      {/* Generate Child Modal (LLM-Generated Hyperlinks) */}
      {llmHyperlinks.showGenerateModal && llmHyperlinks.currentSelection && (
        <GenerateChildModal
          selectedText={llmHyperlinks.currentSelection.text}
          generationType={llmHyperlinks.generationType}
          streamingContent={llmHyperlinks.streamingContent}
          isGenerating={llmHyperlinks.isGenerating}
          onTypeChange={llmHyperlinks.setGenerationType}
          onGenerate={llmHyperlinks.handleGenerate}
          onRegenerate={llmHyperlinks.handleRegenerate}
          onAccept={llmHyperlinks.handleAccept}
          onCancel={llmHyperlinks.handleCancel}
        />
      )}

      {/* Fill-In Modal */}
      {showFillInModal && (
        <FillInModal
          card={card}
          allCards={allCards}
          onClose={() => setShowFillInModal(false)}
          onAccept={handleFillInAccept}
        />
      )}

      {/* Button Settings Modal */}
      {showButtonSettings && (
        <ButtonSettings
          onClose={() => {
            setShowButtonSettings(false);
            // Dispatch event to refresh buttons
            window.dispatchEvent(new CustomEvent('nabokov:buttons-updated'));
          }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={toast.type === 'loading' ? 0 : 0} // Don't auto-close loading, handle manually
        />
      )}

      {/* Handles for connections (hidden but needed for React Flow) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  );
});

CardNode.displayName = 'CardNode';

// Helper function to generate styles with dynamic font sizes
function getStyles(fontSizeValues: import('@/types/settings').FontSizeValues): Record<string, React.CSSProperties> {
  return {
  card: {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, rgba(250, 247, 242, 0.98) 0%, rgba(242, 235, 225, 0.98) 100%)',
    borderRadius: '12px',
    boxShadow: `
      0 2px 8px rgba(92, 77, 66, 0.08),
      0 8px 24px rgba(92, 77, 66, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.5)
    `,
    border: '1px solid rgba(184, 156, 130, 0.2)',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    cursor: 'move',
    transition: 'all 0.2s ease',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  cardCollapsed: {
    height: 'auto',
    minHeight: '56px',
    padding: '12px 16px',
    gap: '0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(184, 156, 130, 0.15)',
    background: 'rgba(255, 255, 255, 0.3)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  favicon: {
    width: '16px',
    height: '16px',
    borderRadius: '3px',
    flexShrink: 0,
  },
  domain: {
    fontSize: '11px',
    color: '#8B7355',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  title: {
    fontSize: fontSizeValues.title,
    fontWeight: 600,
    color: '#3E3226',
    lineHeight: '1.3',
    padding: '8px 12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  titleCollapsed: {
    fontSize: '13px',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '12px',
    // Custom scrollbar styling
    scrollbarWidth: 'thin', // Firefox
    scrollbarColor: 'rgba(139, 0, 0, 0.3) transparent', // Firefox
  },
  contentText: {
    fontSize: fontSizeValues.content,
    color: '#5C4D42',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  contentHTML: {
    fontSize: fontSizeValues.contentHTML,
    color: '#5C4D42',
    lineHeight: '1.6',
    wordBreak: 'break-word',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderTop: '1px solid rgba(184, 156, 130, 0.15)',
    gap: '8px',
  },
  footerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  footerCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flex: 1,
    justifyContent: 'center',
  },
  beautifyButtonWrapper: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beautifyMenu: {
    position: 'absolute',
    top: '-10px',
    left: '50%',
    transform: 'translate(-50%, -100%)',
    background: 'rgba(250, 247, 242, 0.98)',
    border: '1px solid rgba(139, 115, 85, 0.25)',
    borderRadius: '8px',
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.15)',
    padding: '8px 10px',
    minWidth: '180px',
    zIndex: 11000,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  beautifyMenuHeader: {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#4A3728',
    fontWeight: 600,
  },
  beautifyMenuButton: {
    fontSize: '13px',
    padding: '6px 8px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(184, 156, 130, 0.15)',
    color: '#3E2F1C',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background 0.2s ease, transform 0.1s ease',
  },
  footerRight: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  iconButton: {
    width: '24px',
    height: '24px',
    padding: '0',
    border: 'none',
    background: 'rgba(184, 156, 130, 0.15)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    transition: 'all 0.2s ease',
  },
  iconButtonDisabled: {
    cursor: 'not-allowed',
    opacity: 0.65,
    background: 'rgba(184, 156, 130, 0.25)',
  },
  iconButtonActive: {
    background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.3), rgba(255, 215, 0, 0.3))',
    boxShadow: '0 0 0 1px rgba(212, 175, 55, 0.5)',
  },
  openWindowButton: {
    width: '20px',
    height: '20px',
    padding: '0',
    border: 'none',
    background: 'rgba(139, 0, 0, 0.1)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    transition: 'all 0.2s ease',
  },
  settingsButton: {
    width: '20px',
    height: '20px',
    padding: '0',
    border: 'none',
    background: 'rgba(139, 115, 85, 0.15)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    transition: 'all 0.2s ease',
  },
  fillInButton: {
    width: '28px',
    height: '20px',
    padding: '0',
    border: 'none',
    background: 'rgba(212, 175, 55, 0.2)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    position: 'relative' as const,
    transition: 'all 0.2s ease',
  },
  connectionBadge: {
    position: 'absolute' as const,
    top: '-4px',
    right: '-4px',
    background: '#d4af37',
    color: 'white',
    fontSize: '9px',
    fontWeight: 600,
    borderRadius: '50%',
    width: '14px',
    height: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid white',
  },
  stashButton: {
    width: '20px',
    height: '20px',
    padding: '0',
    border: 'none',
    background: 'rgba(139, 115, 85, 0.15)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    transition: 'all 0.2s ease',
  },
  collapseButton: {
    width: '24px',
    height: '24px',
    padding: '0',
    border: 'none',
    background: 'rgba(139, 0, 0, 0.08)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    color: '#8B7355',
    transition: 'all 0.2s ease',
  },
  overflowButton: {
    width: '24px',
    height: '24px',
    padding: '0',
    border: 'none',
    background: 'rgba(139, 0, 0, 0.08)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#8B7355',
    transition: 'all 0.2s ease',
  },
  noteDomain: {
    fontWeight: 600,
    color: '#8B0000',
  },
  editButtons: {
    display: 'flex',
    gap: '4px',
  },
  saveButton: {
    width: '24px',
    height: '24px',
    padding: '0',
    border: 'none',
    background: 'rgba(0, 128, 0, 0.1)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    color: '#008000',
    transition: 'all 0.2s ease',
  },
  cancelButton: {
    width: '24px',
    height: '24px',
    padding: '0',
    border: 'none',
    background: 'rgba(139, 0, 0, 0.1)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    color: '#8B0000',
    transition: 'all 0.2s ease',
  },
  titleEdit: {
    fontSize: fontSizeValues.title,
    fontWeight: 600,
    color: '#3E3226',
    background: 'rgba(255, 255, 255, 0.7)',
    border: '1px solid rgba(184, 156, 130, 0.3)',
    borderRadius: '4px',
    padding: '8px',
    outline: 'none',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  contentEdit: {
    flex: 1,
    fontSize: fontSizeValues.content,
    color: '#5C4D42',
    lineHeight: '1.5',
    background: 'rgba(255, 255, 255, 0.7)',
    border: '1px solid rgba(184, 156, 130, 0.3)',
    borderRadius: '4px',
    padding: '8px',
    outline: 'none',
    resize: 'none',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  editFooter: {
    paddingTop: '8px',
    borderTop: '1px solid rgba(184, 156, 130, 0.15)',
    marginTop: 'auto',
  },
  editHint: {
    fontSize: '10px',
    color: '#A89684',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  actionButton: {
    width: '26px',
    height: '26px',
    padding: '0',
    border: '1px solid rgba(139, 0, 0, 0.15)',
    background: 'white',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    transition: 'all 0.2s ease',
  },
  imageContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: '8px',
    background: 'rgba(0, 0, 0, 0.02)',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: '8px',
  },
  chatButton: {
    padding: '4px 10px',
    background: 'linear-gradient(135deg, #D4AF37, #FFD700)',
    color: '#3E3226',
    border: 'none',
    borderRadius: '5px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
  },
  // Markdown Styles
  markdownH1: {
    fontSize: fontSizeValues.h1,
    fontWeight: 600,
    color: '#8B0000',
    margin: '12px 0 6px 0',
  },
  markdownH2: {
    fontSize: fontSizeValues.h2,
    fontWeight: 600,
    color: '#8B7355',
    margin: '10px 0 4px 0',
  },
  markdownH3: {
    fontSize: fontSizeValues.h3,
    fontWeight: 600,
    color: '#5C4D42',
    margin: '8px 0 3px 0',
  },
  markdownP: {
    margin: '6px 0',
  },
  markdownUl: {
    margin: '6px 0 6px 20px',
  },
  markdownOl: {
    margin: '6px 0 6px 20px',
  },
  markdownLi: {
    margin: '3px 0',
  },
  markdownTable: {
    width: '100%',
    borderCollapse: 'collapse',
    margin: '10px 0',
    fontSize: '12px',
  } as React.CSSProperties,
  markdownTh: {
    border: '1px solid rgba(184, 156, 130, 0.3)',
    padding: '6px 8px',
    textAlign: 'left',
    background: 'rgba(212, 175, 55, 0.1)',
    fontWeight: 600,
    color: '#8B7355',
  } as React.CSSProperties,
  markdownTd: {
    border: '1px solid rgba(184, 156, 130, 0.3)',
    padding: '6px 8px',
    textAlign: 'left',
  } as React.CSSProperties,
  markdownStrong: {
    color: '#8B0000',
    fontWeight: 600,
  },
  markdownCode: {
    background: 'rgba(245, 245, 220, 0.5)',
    border: '1px solid rgba(184, 156, 130, 0.2)',
    padding: '2px 4px',
    borderRadius: '3px',
    fontSize: fontSizeValues.code,
    fontFamily: 'Monaco, Menlo, monospace',
  },
  // Skeleton loading styles
  contentGenerating: {
    pointerEvents: 'none',
    opacity: 0.7,
  },
  skeletonContainer: {
    padding: '12px 0',
    animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  } as React.CSSProperties,
  skeletonLine: {
    height: '14px',
    backgroundColor: 'rgba(184, 156, 130, 0.2)',
    borderRadius: '4px',
    marginBottom: '10px',
    width: '100%',
  },
  skeletonText: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#D4AF37',
    fontStyle: 'italic',
    marginTop: '20px',
    animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  } as React.CSSProperties,
  };
}
