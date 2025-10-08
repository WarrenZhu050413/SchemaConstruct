import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Node, Edge, NodeChange, applyNodeChanges, Viewport } from '@xyflow/react';
import type { Card, CanvasState, StorageStats } from '@/types/card';
import type { CardConnection, ConnectionType } from '@/types/connection';
import { loadConnections, saveConnections } from '@/utils/connectionStorage';
import { generateId } from '@/utils/storage';

const STORAGE_KEY = 'nabokov_canvas_state';
const CARDS_KEY = 'cards'; // Must match the key used in src/utils/storage.ts
const FILTERS_KEY = 'nabokov_filters';
const DEBOUNCE_DELAY = 2000; // 2 seconds
const VIEWPORT_DEBOUNCE_DELAY = 500; // 500ms for viewport (faster than card saves)

export interface FilterState {
  searchQuery: string;
  starredOnly: boolean;
  selectedDomains: string[];
  selectedTags: string[];
  dateRange: 'all' | 'last7days' | 'last30days';
}

interface UseCanvasStateReturn {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  cards: Card[];
  filteredCards: Card[];
  isLoading: boolean;
  error: string | null;
  stats: StorageStats | null;
  refreshStats: () => Promise<void>;
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  availableDomains: string[];
  availableTags: string[];
  connections: CardConnection[];
  addConnection: (source: string, target: string, type: ConnectionType, label?: string) => Promise<void>;
  removeConnection: (connectionId: string) => Promise<void>;
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  shouldFitView: boolean;
}

/**
 * Custom hook for managing canvas state
 * - Loads cards from chrome.storage.local on mount
 * - Converts cards to React Flow nodes
 * - Auto-saves position/size changes with debouncing
 * - Provides storage stats
 * - Handles search and filter functionality
 */
export function useCanvasState(): UseCanvasStateReturn {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [connections, setConnections] = useState<CardConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [filters, setFiltersState] = useState<FilterState>({
    searchQuery: '',
    starredOnly: false,
    selectedDomains: [],
    selectedTags: [],
    dateRange: 'all',
  });

  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [shouldFitView, setShouldFitView] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const pendingChangesRef = useRef<Map<string, Node>>(new Map());
  const viewportSaveTimeoutRef = useRef<NodeJS.Timeout>();

  // Load initial canvas state and cards
  useEffect(() => {
    loadCanvasState();

    // Listen for card updates from other components (local events)
    const handleCardUpdate = () => {
      console.log('[Canvas] Received card update event, refreshing...');
      loadCanvasState();
    };
    window.addEventListener('nabokov:cards-updated', handleCardUpdate);

    // Listen for runtime messages (cross-context)
    const handleRuntimeMessage = (message: any) => {
      if (message.type === 'STASH_UPDATED' || message.type === 'CARD_STASHED') {
        console.log('[Canvas] Received stash update via runtime message');
        loadCanvasState();
      }
    };
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    return () => {
      window.removeEventListener('nabokov:cards-updated', handleCardUpdate);
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, []);

  const loadCanvasState = async () => {
    try {
      console.log('[Canvas] Starting to load canvas state...');
      setIsLoading(true);
      setError(null);

      // Load cards and filters from chrome.storage
      console.log('[Canvas] Loading from keys:', [CARDS_KEY, STORAGE_KEY, FILTERS_KEY]);
      const result = await chrome.storage.local.get([CARDS_KEY, STORAGE_KEY, FILTERS_KEY]);
      console.log('[Canvas] Raw storage result:', result);

      const loadedCards: Card[] = result[CARDS_KEY] || [];
      const canvasState: CanvasState | undefined = result[STORAGE_KEY];
      const savedFilters: FilterState | undefined = result[FILTERS_KEY];

      // Filter out stashed cards (they're hidden from canvas)
      const visibleCards = loadedCards.filter((card) => !card.stashed);

      console.log('[Canvas] Loaded cards count:', loadedCards.length);
      console.log('[Canvas] Visible cards count (excluding stashed):', visibleCards.length);
      console.log('[Canvas] Canvas state:', canvasState);
      console.log('[Canvas] Saved filters:', savedFilters);

      setCards(visibleCards);

      // Restore saved filters
      if (savedFilters) {
        setFiltersState(savedFilters);
      }

      // Restore saved viewport or fit view for first-time users
      if (canvasState?.viewportPosition) {
        console.log('[Canvas] Restoring saved viewport:', canvasState.viewportPosition);
        setViewport(canvasState.viewportPosition);
        setShouldFitView(false);
      } else {
        console.log('[Canvas] No saved viewport, will fit view on first load');
        setShouldFitView(true);
      }

      // Load connections
      const loadedConnections = await loadConnections();
      console.log('[Canvas] Loaded connections count:', loadedConnections.length);
      setConnections(loadedConnections);

      // Convert connections to React Flow edges
      const flowEdges = loadedConnections.map(connectionToEdge);
      setEdges(flowEdges);
      console.log('[Canvas] Created React Flow edges count:', flowEdges.length);

      // Convert cards to React Flow nodes (only visible cards, not stashed)
      const flowNodes = visibleCards.map((card, index) =>
        cardToNode(card, index, canvasState)
      );

      console.log('[Canvas] Created React Flow nodes count:', flowNodes.length);
      console.log('[Canvas] React Flow nodes:', flowNodes);

      setNodes(flowNodes);
      console.log('[Canvas] Nodes state set');

      // Load storage stats
      await refreshStats();
      console.log('[Canvas] Canvas state loaded successfully');
    } catch (err) {
      console.error('[Canvas] Error loading canvas state:', err);
      setError(err instanceof Error ? err.message : 'Failed to load canvas state');
    } finally {
      setIsLoading(false);
      console.log('[Canvas] Loading complete, isLoading set to false');
    }
  };

  const refreshStats = async () => {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      const result = await chrome.storage.local.get(CARDS_KEY);
      const cards: Card[] = result[CARDS_KEY] || [];

      setStats({
        totalCards: cards.length,
        bytesUsed: bytesInUse,
        quotaBytes: chrome.storage.local.QUOTA_BYTES,
      });
    } catch (err) {
      console.error('Failed to get storage stats:', err);
    }
  };

  /**
   * Convert Card to React Flow Node
   */
  const cardToNode = (card: Card, index: number, _canvasState?: CanvasState): Node => {
    // Use saved position or calculate grid position
    const position = card.position || calculateGridPosition(index);

    // Use saved size or default
    const size = card.size || { width: 320, height: 240 };

    return {
      id: card.id,
      type: 'cardNode',
      position,
      data: {
        card,
      },
      style: {
        width: size.width,
        height: size.height,
      },
    };
  };

  /**
   * Calculate initial grid position for cards
   * Arrange in a grid with spacing
   */
  const calculateGridPosition = (index: number) => {
    const columns = 4;
    const cardWidth = 320;
    const cardHeight = 240;
    const spacing = 40;

    const row = Math.floor(index / columns);
    const col = index % columns;

    return {
      x: col * (cardWidth + spacing) + 100,
      y: row * (cardHeight + spacing) + 100,
    };
  };

  /**
   * Handle node changes (position, size, selection)
   */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const updatedNodes = applyNodeChanges(changes, nds);

      // Track nodes that need to be saved
      changes.forEach((change) => {
        if (
          change.type === 'position' &&
          change.position &&
          change.dragging === false
        ) {
          const node = updatedNodes.find(n => n.id === change.id);
          if (node) {
            pendingChangesRef.current.set(node.id, node);
          }
        } else if (change.type === 'dimensions') {
          const node = updatedNodes.find(n => n.id === change.id);
          if (node) {
            pendingChangesRef.current.set(node.id, node);
          }
        }
      });

      // Debounced save
      if (pendingChangesRef.current.size > 0) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
          saveNodeChanges();
        }, DEBOUNCE_DELAY);
      }

      return updatedNodes;
    });
  }, []);

  /**
   * Save node position/size changes to storage
   */
  const saveNodeChanges = async () => {
    try {
      const nodesToSave = Array.from(pendingChangesRef.current.values());

      if (nodesToSave.length === 0) return;

      // Load current cards
      const result = await chrome.storage.local.get(CARDS_KEY);
      const currentCards: Card[] = result[CARDS_KEY] || [];

      // Update cards with new positions/sizes
      const updatedCards = currentCards.map(card => {
        const node = nodesToSave.find(n => n.id === card.id);
        if (node) {
          // Helper function to extract numeric dimension from various formats
          const getNumericDimension = (value: any, fallback: number): number => {
            if (typeof value === 'number') return value;
            if (typeof value === 'string') {
              const parsed = parseFloat(value);
              if (!isNaN(parsed)) return parsed;
            }
            return fallback;
          };

          // In React Flow v12, dimensions are stored in node.measured.width/height
          // Try multiple sources for width/height in order of preference
          const width =
            getNumericDimension(node.measured?.width, 0) ||     // React Flow v12 measured dimensions (primary)
            getNumericDimension(node.width, 0) ||               // Direct property (if setAttributes was used)
            getNumericDimension(node.style?.width, 0) ||        // Style property (legacy/fallback)
            card.size?.width ||                                  // Existing saved size
            320;                                                 // Default

          const height =
            getNumericDimension(node.measured?.height, 0) ||    // React Flow v12 measured dimensions (primary)
            getNumericDimension(node.height, 0) ||              // Direct property (if setAttributes was used)
            getNumericDimension(node.style?.height, 0) ||       // Style property (legacy/fallback)
            card.size?.height ||                                 // Existing saved size
            240;                                                 // Default

          return {
            ...card,
            position: node.position,
            size: { width, height },
            updatedAt: Date.now(),
          };
        }
        return card;
      });

      // Save updated cards
      await chrome.storage.local.set({ [CARDS_KEY]: updatedCards });

      // Clear pending changes
      pendingChangesRef.current.clear();

      console.log(`Saved position/size changes for ${nodesToSave.length} cards`);
    } catch (err) {
      console.error('Failed to save node changes:', err);
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  /**
   * Save viewport position and zoom to storage (debounced)
   */
  const saveViewport = async (newViewport: Viewport) => {
    try {
      // Load current canvas state and cards so we persist both
      const [stateResult, cardsResult] = await Promise.all([
        chrome.storage.local.get(STORAGE_KEY),
        chrome.storage.local.get(CARDS_KEY),
      ]);

      const canvasState: CanvasState = stateResult[STORAGE_KEY] || {
        cards: [],
        viewportPosition: { x: 0, y: 0, zoom: 1 },
      };

      const storedCards: Card[] = cardsResult[CARDS_KEY] || [];

      // Update viewport position and cards snapshot
      const updatedCanvasState: CanvasState = {
        ...canvasState,
        cards: storedCards,
        viewportPosition: newViewport,
      };

      // Save to storage
      await chrome.storage.local.set({ [STORAGE_KEY]: updatedCanvasState });

      console.log('[Canvas] Saved viewport:', newViewport);
    } catch (err) {
      console.error('[Canvas] Failed to save viewport:', err);
    }
  };

  /**
   * Handle viewport changes with debouncing
   */
  const onViewportChange = useCallback((newViewport: Viewport) => {
    // Update local state immediately for responsive UI
    setViewport(newViewport);

    // Debounced save to storage
    if (viewportSaveTimeoutRef.current) {
      clearTimeout(viewportSaveTimeoutRef.current);
    }

    viewportSaveTimeoutRef.current = setTimeout(() => {
      saveViewport(newViewport);
    }, VIEWPORT_DEBOUNCE_DELAY);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveNodeChanges(); // Save any pending changes
      }
      if (viewportSaveTimeoutRef.current) {
        clearTimeout(viewportSaveTimeoutRef.current);
        // Save viewport immediately on unmount
        const currentViewport = viewport;
        saveViewport(currentViewport);
      }
    };
  }, [viewport]);

  // Save filters to session storage when they change
  useEffect(() => {
    const saveFilters = async () => {
      try {
        await chrome.storage.session.set({ [FILTERS_KEY]: filters });
      } catch (err) {
        console.error('Failed to save filters:', err);
      }
    };
    saveFilters();
  }, [filters]);

  // Extract unique domains from cards
  const availableDomains = useMemo(() => {
    const domains = new Set(cards.map(card => card.metadata.domain));
    return Array.from(domains).sort();
  }, [cards]);

  // Extract unique tags from cards
  const availableTags = useMemo(() => {
    const tags = new Set(cards.flatMap(card => card.tags));
    return Array.from(tags).sort();
  }, [cards]);

  // Filter cards based on current filters
  const filteredCards = useMemo(() => {
    let result = [...cards];

    // Search filter
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter(card => {
        const titleMatch = card.metadata.title.toLowerCase().includes(query);
        const domainMatch = card.metadata.domain.toLowerCase().includes(query);
        const contentMatch = card.content?.toLowerCase().includes(query) || false;
        const tagsMatch = card.tags.some(tag => tag.toLowerCase().includes(query));
        return titleMatch || domainMatch || contentMatch || tagsMatch;
      });
    }

    // Starred filter
    if (filters.starredOnly) {
      result = result.filter(card => card.starred);
    }

    // Domain filter
    if (filters.selectedDomains.length > 0) {
      result = result.filter(card =>
        filters.selectedDomains.includes(card.metadata.domain)
      );
    }

    // Tags filter
    if (filters.selectedTags.length > 0) {
      result = result.filter(card =>
        filters.selectedTags.some(tag => card.tags.includes(tag))
      );
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1000;
      const cutoff = filters.dateRange === 'last7days'
        ? now - (7 * msPerDay)
        : now - (30 * msPerDay);

      result = result.filter(card => card.createdAt >= cutoff);
    }

    return result;
  }, [cards, filters]);

  // Update nodes when filtered cards change
  useEffect(() => {
    const flowNodes = filteredCards.map((card, index) => {
      // Find existing node to preserve position
      const existingNode = nodes.find(n => n.id === card.id);
      if (existingNode) {
        return {
          ...existingNode,
          data: { card },
        };
      }
      return cardToNode(card, index);
    });
    setNodes(flowNodes);
  }, [filteredCards]);

  // Update filters handler
  const setFilters = useCallback((newFilters: FilterState) => {
    setFiltersState(newFilters);
  }, []);

  /**
   * Convert Connection to React Flow Edge
   */
  const connectionToEdge = (connection: CardConnection): Edge => {
    const edgeStyles = {
      'generated-from': { stroke: '#D4AF37', strokeWidth: 2 },
      'references': { stroke: '#8B7355', strokeWidth: 1, strokeDasharray: '5,5' },
      'related': { stroke: '#B89C82', strokeWidth: 1 },
      'contradicts': { stroke: '#8B0000', strokeWidth: 2 },
      'custom': { stroke: '#8B7355', strokeWidth: 1 },
    };

    return {
      id: connection.id,
      source: connection.source,
      target: connection.target,
      type: 'smoothstep',
      label: connection.label,
      style: edgeStyles[connection.type] || edgeStyles.related,
      animated: connection.type === 'generated-from',
      markerEnd: {
        type: 'arrowclosed',
        width: 20,
        height: 20,
        color: edgeStyles[connection.type]?.stroke || '#B89C82',
      },
    };
  };

  /**
   * Add a new connection between two cards
   */
  const addConnection = useCallback(async (
    source: string,
    target: string,
    type: ConnectionType,
    label?: string
  ) => {
    try {
      const newConnection: CardConnection = {
        id: generateId(),
        source,
        target,
        type,
        label,
        metadata: {
          createdAt: Date.now(),
          createdBy: 'user',
        },
      };

      const updatedConnections = [...connections, newConnection];
      setConnections(updatedConnections);
      await saveConnections(updatedConnections);

      // Update edges
      const newEdge = connectionToEdge(newConnection);
      setEdges(prev => [...prev, newEdge]);

      console.log('[Canvas] Connection created:', newConnection);
    } catch (err) {
      console.error('[Canvas] Error adding connection:', err);
      throw err;
    }
  }, [connections]);

  /**
   * Remove a connection by ID
   */
  const removeConnection = useCallback(async (connectionId: string) => {
    try {
      const updatedConnections = connections.filter(c => c.id !== connectionId);
      setConnections(updatedConnections);
      await saveConnections(updatedConnections);

      // Update edges
      setEdges(prev => prev.filter(e => e.id !== connectionId));

      console.log('[Canvas] Connection removed:', connectionId);
    } catch (err) {
      console.error('[Canvas] Error removing connection:', err);
      throw err;
    }
  }, [connections]);

  return {
    nodes,
    edges,
    onNodesChange,
    cards,
    filteredCards,
    isLoading,
    error,
    stats,
    refreshStats,
    filters,
    setFilters,
    availableDomains,
    availableTags,
    connections,
    addConnection,
    removeConnection,
    viewport,
    onViewportChange,
    shouldFitView,
  };
}
