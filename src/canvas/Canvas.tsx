import React, { useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './keyboardShortcuts.css';
import { CardNode } from './CardNode';
import { Toolbar } from './Toolbar';
import { useCanvasState } from './useCanvasState';
import { KeyboardHelp } from '@/components/KeyboardHelp';
import { SettingsPanel } from './SettingsPanel';
import { APISettings } from '@/components/APISettings';
import { FloatingWindow } from '@/components/FloatingWindow';
import { EdgeEditModal } from '@/components/EdgeEditModal';
import { windowManager } from '@/services/windowManager';
import type { ConnectionType } from '@/types/connection';
import {
  globalShortcutManager,
  KeyboardShortcut,
  loadShortcutsConfig,
  mergeShortcutsConfig,
} from '@/utils/keyboardShortcuts';
import type { WindowState } from '@/types/window';
import type { Card } from '@/types/card';
import { saveCard, generateId } from '@/utils/storage';
import { createImageCards } from '@/utils/imageUpload';
import { FilePickerButton } from '@/shared/components/ImageUpload';

// Register custom node types
const nodeTypes = {
  cardNode: CardNode,
};

function CanvasInner() {
  const {
    nodes,
    edges,
    onNodesChange,
    cards,
    filteredCards,
    isLoading,
    error,
    stats,
    filters,
    setFilters,
    availableDomains,
    availableTags,
    refreshStats,
    connections,
    addConnection,
    removeConnection,
    viewport,
    onViewportChange,
    shouldFitView,
  } = useCanvasState();

  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAPISettings, setShowAPISettings] = useState(false);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([]);
  const toolbarRef = useRef<{ focusSearch: () => void; toggleFilters: () => void }>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [windows, setWindows] = useState(windowManager.getWindows());
  const [connectionMode, setConnectionMode] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showEdgeModal, setShowEdgeModal] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{ source: string; target: string } | null>(null);
  const [showMiniMap, setShowMiniMap] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true
  );

  useEffect(() => {
    const styleId = 'canvas-minimap-pointer-events';
    if (document.getElementById(styleId)) {
      return;
    }

    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      .react-flow__minimap,
      .react-flow__minimap * {
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(styleEl);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setShowMiniMap(window.innerWidth >= 640);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize keyboard shortcuts
  useEffect(() => {
    initializeShortcuts();
    globalShortcutManager.start();

    return () => {
      globalShortcutManager.stop();
    };
  }, []);

  // Initialize window manager and subscribe to changes
  useEffect(() => {
    windowManager.initialize();

    const unsubscribe = windowManager.subscribe(() => {
      setWindows(windowManager.getWindows());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle fitView for first-time users (when no saved viewport exists)
  useEffect(() => {
    if (shouldFitView && !isLoading) {
      console.log('[Canvas] First-time user detected, fitting view');
      fitView({ padding: 0.2, duration: 400 });
    }
  }, [shouldFitView, isLoading, fitView]);

  const initializeShortcuts = async () => {
    try {
      const userConfig = await loadShortcutsConfig();
      const mergedShortcuts = mergeShortcutsConfig(userConfig);

      // Create shortcut handlers
      const shortcutList: KeyboardShortcut[] = Object.entries(mergedShortcuts).map(
        ([id, shortcut]) => ({
          ...shortcut,
          handler: createShortcutHandler(id),
        })
      );

      setShortcuts(shortcutList);

      // Register all shortcuts with the manager
      shortcutList.forEach((shortcut) => {
        globalShortcutManager.register(shortcut);
      });
    } catch (error) {
      console.error('Failed to initialize shortcuts:', error);
    }
  };

  const createShortcutHandler = (id: string) => {
    const handlers: Record<string, () => void> = {
      focusSearch: () => {
        toolbarRef.current?.focusSearch();
        showFeedback('Search focused');
      },
      toggleFilter: () => {
        toolbarRef.current?.toggleFilters();
        showFeedback('Filters toggled');
      },
      escape: () => {
        if (showKeyboardHelp) {
          setShowKeyboardHelp(false);
        } else if (showSettings) {
          setShowSettings(false);
        } else if (filters.searchQuery) {
          setFilters({ ...filters, searchQuery: '' });
          showFeedback('Search cleared');
        }
      },
      showHelp: () => {
        setShowKeyboardHelp(!showKeyboardHelp);
      },
      toggleStarred: () => {
        setFilters({ ...filters, starredOnly: !filters.starredOnly });
        showFeedback(filters.starredOnly ? 'Showing all cards' : 'Showing starred cards');
      },
      fitView: () => {
        fitView({ padding: 0.2, duration: 400 });
        showFeedback('View fitted');
      },
      zoomIn: () => {
        zoomIn();
        showFeedback('Zoomed in');
      },
      zoomOut: () => {
        zoomOut();
        showFeedback('Zoomed out');
      },
      // Tag filters 1-9
      tag1: () => handleTagFilter(0),
      tag2: () => handleTagFilter(1),
      tag3: () => handleTagFilter(2),
      tag4: () => handleTagFilter(3),
      tag5: () => handleTagFilter(4),
      tag6: () => handleTagFilter(5),
      tag7: () => handleTagFilter(6),
      tag8: () => handleTagFilter(7),
      tag9: () => handleTagFilter(8),
      // Create note
      createNote: () => {
        handleCreateNote();
        showFeedback('Creating note...');
      },
      // Connection mode
      toggleConnectionMode: () => {
        handleToggleConnectionMode();
      },
    };

    return handlers[id] || (() => console.log(`Unhandled shortcut: ${id}`));
  };

  const handleTagFilter = (index: number) => {
    const tag = availableTags[index];
    if (!tag) {
      showFeedback(`No tag at position ${index + 1}`);
      return;
    }

    const isSelected = filters.selectedTags.includes(tag);
    const newTags = isSelected
      ? filters.selectedTags.filter((t) => t !== tag)
      : [...filters.selectedTags, tag];

    setFilters({ ...filters, selectedTags: newTags });
    showFeedback(`${isSelected ? 'Removed' : 'Added'} filter: #${tag}`);
  };

  const showFeedback = (message: string) => {
    setFeedbackMessage(message);
    setTimeout(() => setFeedbackMessage(null), 2000);
  };

  const handleOpenSettings = () => {
    setShowSettings(true);
  };

  const handleOpenAPISettings = () => {
    setShowAPISettings(true);
  };

  const handleOpenSidePanel = async () => {
    try {
      console.log('[Canvas] Opening side panel...');

      // Check if sidePanel API is available
      if (!chrome.sidePanel) {
        throw new Error('Side Panel API not available');
      }

      // Get current window ID
      const currentWindow = await chrome.windows.getCurrent();
      console.log('[Canvas] Current window:', currentWindow);

      if (!currentWindow.id) {
        throw new Error('No window ID available');
      }

      console.log('[Canvas] Opening side panel for window:', currentWindow.id);
      await chrome.sidePanel.open({ windowId: currentWindow.id });

      console.log('[Canvas] Side panel opened successfully');
      showFeedback('Side panel opened');
    } catch (error) {
      console.error('[Canvas] Error opening side panel:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showFeedback(`Failed to open side panel: ${errorMessage}`);
    }
  };

  const handleCreateNote = async () => {
    try {
      // Get current viewport center position
      const { x, y, zoom } = { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 };

      const newNote: Card = {
        id: generateId(),
        content: '<p>Start typing...</p>',
        cardType: 'note',
        metadata: {
          url: '',
          title: 'Untitled Note',
          domain: 'notes',
          favicon: '📝',
          timestamp: Date.now(),
        },
        position: {
          x: x / zoom - 160, // Center the 320px wide card
          y: y / zoom - 120, // Center the 240px tall card
        },
        size: { width: 320, height: 240 },
        starred: false,
        tags: ['note'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        conversation: [],
      };

      await saveCard(newNote);

      // Dispatch event to refresh cards
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));

      showFeedback('Note created');
    } catch (error) {
      console.error('[Canvas] Error creating note:', error);
      showFeedback('Failed to create note');
    }
  };

  const handleToggleConnectionMode = () => {
    setConnectionMode(!connectionMode);
    setSelectedSource(null);
    showFeedback(connectionMode ? 'Connection mode off' : 'Connection mode on - click source card');
  };

  const handleNodeClick = async (_event: React.MouseEvent, node: any) => {
    if (!connectionMode) return;

    if (!selectedSource) {
      // First click - select source
      setSelectedSource(node.id);
      showFeedback('Source selected - click target card');
    } else if (selectedSource === node.id) {
      // Clicking same node - deselect
      setSelectedSource(null);
      showFeedback('Selection cleared - click source card');
    } else {
      // Second click - show modal to customize connection
      setPendingConnection({ source: selectedSource, target: node.id });
      setShowEdgeModal(true);
    }
  };

  const handleEdgeSubmit = async (type: ConnectionType, label: string) => {
    if (!pendingConnection) return;

    try {
      await addConnection(pendingConnection.source, pendingConnection.target, type, label);
      showFeedback('Connection created');
      setSelectedSource(null);
      setConnectionMode(false);
      setShowEdgeModal(false);
      setPendingConnection(null);
    } catch (error) {
      console.error('[Canvas] Error creating connection:', error);
      showFeedback('Failed to create connection');
    }
  };

  const handleEdgeCancel = () => {
    setShowEdgeModal(false);
    setPendingConnection(null);
    // Keep source selected so user can try again
    showFeedback('Connection cancelled - select target again');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only reset if leaving the canvas container
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);

    if (files.length === 0) {
      return;
    }

    // Filter for image files only
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      showFeedback('No image files found');
      return;
    }

    await handleImageFiles(imageFiles, { x: e.clientX - 200, y: e.clientY - 150 });
  };

  const handleImageFiles = async (files: File[], position: { x: number; y: number }) => {
    try {
      showFeedback(`Uploading ${files.length} image${files.length > 1 ? 's' : ''}...`);

      // Create image cards
      const createdCards = await createImageCards(files, position);

      // Dispatch event to refresh cards
      window.dispatchEvent(new CustomEvent('nabokov:cards-updated'));

      showFeedback(`Successfully added ${createdCards.length} image card${createdCards.length > 1 ? 's' : ''} ✨`);
    } catch (error) {
      console.error('[Canvas] Error uploading images:', error);
      showFeedback('Failed to upload images');
    }
  };

  const handleFilesSelected = async (files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      showFeedback('No image files selected');
      return;
    }

    // Default position for file picker uploads (center of viewport)
    const position = {
      x: window.innerWidth / 2 - 160,
      y: window.innerHeight / 2 - 120,
    };

    await handleImageFiles(imageFiles, position);
  };

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner} />
        <div style={styles.loadingText}>Loading your canvas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorIcon}>⚠</div>
        <div style={styles.errorText}>{error}</div>
        <button
          style={styles.retryButton}
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div style={styles.emptyContainer}>
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          fill="none"
          style={styles.emptyIcon}
        >
          <rect
            x="20"
            y="30"
            width="80"
            height="60"
            rx="8"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
          />
          <path
            d="M35 50H85M35 60H85M35 70H65"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <div style={styles.emptyTitle}>Your canvas is empty</div>
        <div style={styles.emptyText}>
          Start clipping web content to see your cards appear here
        </div>
      </div>
    );
  }

  // Show "no results" state when filters are active but no cards match
  const hasActiveFilters =
    filters.searchQuery.trim() !== '' ||
    filters.starredOnly ||
    filters.selectedDomains.length > 0 ||
    filters.selectedTags.length > 0 ||
    filters.dateRange !== 'all';

  return (
    <div
      style={styles.container}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDraggingOver && (
        <div style={styles.dragOverlay}>
          <div style={styles.dragOverlayContent}>
            <div style={styles.dragIcon}>🖼️</div>
            <div style={styles.dragText}>Drop images here</div>
          </div>
        </div>
      )}

      <Toolbar
        ref={toolbarRef}
        stats={stats}
        filters={filters}
        setFilters={setFilters}
        availableDomains={availableDomains}
        availableTags={availableTags}
        resultCount={filteredCards.length}
        totalCount={cards.length}
        onSettingsClick={handleOpenSettings}
        onAPISettingsClick={handleOpenAPISettings}
        onCreateNote={handleCreateNote}
        onToggleConnectionMode={handleToggleConnectionMode}
        onOpenSidePanel={handleOpenSidePanel}
        onUploadImages={handleFilesSelected}
        connectionMode={connectionMode}
      />

      {/* Keyboard shortcuts feedback */}
      {feedbackMessage && (
        <div style={styles.feedbackToast} role="alert" aria-live="polite">
          {feedbackMessage}
        </div>
      )}

      {/* Keyboard help overlay */}
      <KeyboardHelp
        shortcuts={shortcuts}
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />

      {/* Settings panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        stats={stats}
        onRefreshStats={refreshStats}
      />

      {/* API Settings */}
      {showAPISettings && (
        <APISettings onClose={() => setShowAPISettings(false)} />
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        defaultViewport={viewport}
        onMove={(_event, viewport) => onViewportChange(viewport)}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        {/* Chinese aesthetic background with paper texture */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={1.5}
          color="rgba(184, 156, 130, 0.15)"
          style={{
            background: `
              linear-gradient(135deg, #FAF7F2 0%, #F5F0E8 50%, #FAF7F2 100%),
              repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(184, 156, 130, 0.02) 10px, rgba(184, 156, 130, 0.02) 20px)
            `,
          }}
        />

        {/* MiniMap stays hidden on compact viewports to avoid overlapping card controls */}
        {showMiniMap && (
          <MiniMap
            nodeStrokeColor={() => '#8B7355'}
            nodeColor={() => '#F2EBE1'}
            nodeBorderRadius={8}
            position="top-left"
            pannable={false}
            zoomable={false}
            style={{
              width: 140,
              height: 100,
              background: 'rgba(250, 247, 242, 0.9)',
              border: '1px solid rgba(184, 156, 130, 0.3)',
              borderRadius: '8px',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Zoom and fit view controls */}
        <Controls
          style={{
            background: 'rgba(250, 247, 242, 0.95)',
            border: '1px solid rgba(184, 156, 130, 0.3)',
            borderRadius: '8px',
          }}
          showInteractive={false}
        />

        {/* No results overlay when filters are active */}
        {hasActiveFilters && filteredCards.length === 0 && (
          <div style={styles.noResultsOverlay}>
            <div style={styles.noResultsContent}>
              <svg
                width="80"
                height="80"
                viewBox="0 0 80 80"
                fill="none"
                style={styles.noResultsIcon}
              >
                <circle
                  cx="35"
                  cy="35"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                />
                <path
                  d="M50 50L65 65"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M25 35L45 35M35 25L35 45"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity="0.3"
                />
              </svg>
              <div style={styles.noResultsTitle}>No cards found</div>
              <div style={styles.noResultsText}>
                Try adjusting your search or filters
              </div>
            </div>
          </div>
        )}
      </ReactFlow>

      {/* Floating windows container */}
      <div id="floating-windows-container" style={styles.floatingWindowsContainer}>
        {windows.map((windowState: WindowState) => {
          const card = cards.find(c => c.id === windowState.cardId);
          if (!card) return null;

          return (
            <FloatingWindow
              key={windowState.cardId}
              card={card}
              windowState={windowState}
            />
          );
        })}
      </div>

      {/* Edge Edit Modal */}
      {showEdgeModal && (
        <EdgeEditModal
          onSubmit={handleEdgeSubmit}
          onCancel={handleEdgeCancel}
        />
      )}
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100vw',
    height: '100vh',
    background: '#FAF7F2',
    position: 'relative',
  },
  floatingWindowsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 10,
  },
  loadingContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #FAF7F2 0%, #F5F0E8 50%, #FAF7F2 100%)',
    color: '#5C4D42',
  },
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(184, 156, 130, 0.2)',
    borderTop: '4px solid #D4AF37',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '24px',
    fontSize: '16px',
    fontWeight: 500,
    color: '#8B7355',
  },
  errorContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #FAF7F2 0%, #F5F0E8 50%, #FAF7F2 100%)',
    color: '#5C4D42',
  },
  errorIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  errorText: {
    fontSize: '16px',
    color: '#8B7355',
    marginBottom: '24px',
  },
  retryButton: {
    padding: '10px 24px',
    background: '#D4AF37',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  emptyContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #FAF7F2 0%, #F5F0E8 50%, #FAF7F2 100%)',
    color: '#5C4D42',
  },
  emptyIcon: {
    color: '#B89C82',
    marginBottom: '24px',
    opacity: 0.7,
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#3E3226',
    marginBottom: '12px',
  },
  emptyText: {
    fontSize: '16px',
    color: '#8B7355',
    textAlign: 'center',
    maxWidth: '400px',
    lineHeight: '1.5',
  },
  noResultsOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 10,
    pointerEvents: 'none',
  },
  noResultsContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px',
    background: 'rgba(250, 247, 242, 0.95)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(92, 77, 66, 0.15)',
    border: '1px solid rgba(184, 156, 130, 0.3)',
  },
  noResultsIcon: {
    color: '#B89C82',
    marginBottom: '16px',
    opacity: 0.7,
  },
  noResultsTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#3E3226',
    marginBottom: '8px',
  },
  noResultsText: {
    fontSize: '14px',
    color: '#8B7355',
  },
  feedbackToast: {
    position: 'fixed',
    bottom: '32px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 24px',
    background: 'rgba(92, 77, 66, 0.95)',
    color: 'white',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    boxShadow: '0 4px 20px rgba(92, 77, 66, 0.3)',
    zIndex: 10001,
    animation: 'slideUpFade 0.3s ease-out',
    backdropFilter: 'blur(10px)',
  },
  dragOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(212, 175, 55, 0.1)',
    backdropFilter: 'blur(4px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    border: '3px dashed #D4AF37',
  },
  dragOverlayContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px',
    background: 'rgba(250, 247, 242, 0.95)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(92, 77, 66, 0.15)',
    border: '1px solid rgba(184, 156, 130, 0.3)',
  },
  dragIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  dragText: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#3E3226',
  },
};
