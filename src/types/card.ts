/**
 * Card types for Nabokov Web Clipper
 * This is the single source of truth for all Card-related types.
 */

/**
 * Message in a conversation thread
 * @deprecated Use Message from './chat' instead for new code
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
  parentId?: string;
  // Multimodal support
  images?: Array<{
    dataURL: string;
    width: number;
    height: number;
  }>;
  thinking?: string; // Optional assistant reasoning block (collapsed UI)
}

/**
 * Chat context for maintaining conversation state
 */
export interface ChatContext {
  cardId: string;
  messages: Message[];
  isStreaming: boolean;
  currentInput: string;
  parentMessageId?: string;
}

/**
 * Metadata about the source page where content was clipped
 */
export interface ClipMetadata {
  url: string;
  title: string;
  domain: string;
  favicon?: string;
  timestamp: number;
  selectedText?: string;
  // Element capture fields (optional for backward compatibility)
  tagName?: string;
  selector?: string;
  textContent?: string;
  dimensions?: { width: number; height: number };
}

/**
 * Position of a card on the canvas
 */
export interface CardPosition {
  x: number;
  y: number;
}

/**
 * Size of a card on the canvas
 */
export interface CardSize {
  width: number;
  height: number;
}

/**
 * AI Beautification mode for card content
 */
export type BeautificationMode = 'organize-content';

/**
 * Fill-in strategy for connection-based synthesis
 */
export type FillInStrategy = 'replace' | 'append' | 'merge';

/**
 * History entry for fill-in operations
 */
export interface FillInHistoryEntry {
  timestamp: number;
  sourceCardIds: string[]; // Cards that contributed to this fill-in
  strategy: FillInStrategy;
  userPrompt?: string; // Optional guidance from user
  previousContent?: string; // Snapshot before fill-in (for undo)
}


/**
 * Main card data structure for the canvas view
 * This is the primary Card type used throughout the application
 */
export interface Card {
  id: string;
  content?: string; // HTML content (sanitized) - optional for image-only cards
  metadata: ClipMetadata;
  position?: CardPosition;
  size?: CardSize;
  starred: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  conversation?: Message[]; // Conversation history with Claude
  // Additional fields for element rendering
  styles?: import('../types').RelevantStyles; // Computed styles for rendering
  context?: string; // Parent element context (HTML snippet)
  // Card type and relationships
  cardType?: 'clipped' | 'generated' | 'note' | 'image'; // Type of card
  parentCardId?: string; // Reference to parent card (for generated cards)
  generationContext?: {
    sourceMessageId: string;
    userPrompt: string;
    timestamp: number;
  };
  // Image upload fields
  imageData?: string; // Base64-encoded image data for drag-dropped images
  imageMimeType?: string; // MIME type of image (e.g., 'image/png', 'image/jpeg')
  imageDimensions?: { width: number; height: number }; // Original image dimensions
  // UI state
  collapsed?: boolean; // Whether card is collapsed to minimal height
  stashed?: boolean; // Whether card is stashed (hidden from canvas)
  isGenerating?: boolean; // Whether card is currently being generated (skeleton state)
  // AI Beautification fields
  originalHTML?: string; // Original HTML before beautification
  beautifiedContent?: string; // LLM-beautified HTML content
  beautificationMode?: BeautificationMode; // Which beautification mode was used
  beautificationTimestamp?: number; // When beautification was applied
  // Fill-in synthesis fields
  fillInHistory?: FillInHistoryEntry[]; // History of fill-in operations
}

/**
 * State of the canvas including all cards and viewport position
 */
export interface CanvasState {
  cards: Card[];
  viewportPosition: { x: number; y: number; zoom: number };
}

/**
 * Storage statistics for monitoring storage usage
 */
export interface StorageStats {
  totalCards: number;
  bytesUsed: number;
  quotaBytes: number;
}
