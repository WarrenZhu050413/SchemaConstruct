/**
 * Type definitions for Nabokov Web Clipper
 *
 * This is the single source of truth for all types in the application.
 * All other files should import from here using the @ alias.
 */

// Re-export all card types (includes Message, ChatContext, Card, etc.)
export * from './card';

// ============================================================================
// Style Types
// ============================================================================

/**
 * Filtered CSS properties for element styling.
 * Limited to 12 essential properties to minimize storage.
 */
export interface RelevantStyles {
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  padding?: string;
  margin?: string;
  border?: string;
  display?: string;
  position?: string;
  width?: string;
  height?: string;
}

// ============================================================================
// Element and Metadata Types
// ============================================================================


/**
 * Element data including HTML, styles, and screenshot reference.
 * HTML is sanitized with DOMPurify and limited to 10KB.
 */
export interface ElementData {
  html: string;              // Sanitized HTML content, max 10KB
  htmlPreview: string;       // First 500 characters for quick display
  selector: string;          // CSS selector for element identification
  computedStyles: RelevantStyles;  // Filtered CSS properties (12 only)
  screenshotId?: string;     // Reference to screenshot in IndexedDB
}

/**
 * Source page metadata for the clipped element.
 */
export interface SourceMetadata {
  url: string;               // Full URL of the source page
  title: string;             // Page title
  domain: string;            // Extracted domain name
  timestamp: number;         // Unix timestamp of clip creation
  surrounding: string;       // Surrounding text context
  favicon?: string;          // Base64 encoded favicon
}

/**
 * Canvas positioning and dimensions for React Flow.
 * Note: zIndex is managed by React Flow internally.
 */
export interface CanvasPosition {
  position: {
    x: number;
    y: number;
  };
  width: number;             // Card width in pixels
  height: number;            // Card height in pixels
}

/**
 * Card metadata for tracking and organization.
 */
export interface CardMetadata {
  created: number;           // Unix timestamp of creation
  lastModified: number;      // Unix timestamp of last modification
  lastViewed: number;        // Unix timestamp of last view
  viewCount: number;         // Number of times viewed
  tags?: string[];           // User-defined tags
  storageSize?: number;      // Size in bytes for quota monitoring
  color?: string;            // User-defined color (hex)
  starred?: boolean;         // Starred status for quick access
}


// ============================================================================
// Conversation Types
// ============================================================================
// Message and ChatContext are exported from './card'

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Storage quota information for monitoring chrome.storage.local usage.
 * Warning should be shown at 80% usage.
 */
export interface StorageQuota {
  used: number;              // Bytes used
  total: number;             // Total bytes available
  percentage: number;        // Usage percentage (0-100)
}

/**
 * chrome.storage.local data structure.
 * Contains all card metadata and references to IndexedDB screenshots.
 */
export interface StorageData {
  cards: import('./card').Card[];  // Array of card data
  lastSync: number;                     // Last sync timestamp
  version: string;                      // Storage schema version
}

// ============================================================================
// UI Component Props
// ============================================================================

/**
 * Props for ElementSelector component.
 */
export interface ElementSelectorProps {
  isActive: boolean;
  onElementSelected: (element: HTMLElement) => void;
  onCancel: () => void;
}

/**
 * Props for FloatingChat component.
 */
export interface FloatingChatProps {
  element: HTMLElement;
  cardId: string;
  initialMessages?: import('./card').Message[];
  onClose: () => void;
  onSave: (card: import('./card').Card) => void;
}

/**
 * Props for CardNode component (React Flow custom node).
 */
export interface CardNodeProps {
  id: string;
  data: import('./card').Card;
  selected: boolean;
}

/**
 * Props for ChatModal component.
 */
export interface ChatModalProps {
  card: import('./card').Card;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (card: import('./card').Card) => void;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Mock Claude API request structure.
 */
export interface ClaudeAPIRequest {
  messages: import('./card').Message[];
  maxTokens?: number;
  stream?: boolean;
}

/**
 * Mock Claude API response structure.
 */
export interface ClaudeAPIResponse {
  id: string;
  content: string;
  role: 'assistant';
  stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence';
}

/**
 * Streaming response chunk for mock Claude API.
 */
export interface ClaudeAPIStreamChunk {
  type: 'content_block_delta' | 'message_stop';
  delta?: {
    text: string;
  };
}

// ============================================================================
// Extension Message Types
// ============================================================================

/**
 * Message types for communication between extension components.
 */
export type ExtensionMessageType =
  | 'ACTIVATE_SELECTOR'
  | 'ELEMENT_SELECTED'
  | 'SAVE_CARD'
  | 'UPDATE_CARD'
  | 'DELETE_CARD'
  | 'GET_CARDS'
  | 'OPEN_CANVAS'
  | 'CHECK_QUOTA';

/**
 * Generic extension message structure.
 */
export interface ExtensionMessage<T = any> {
  type: ExtensionMessageType;
  payload?: T;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Element capture result from the selection process.
 */
export interface ElementCaptureResult {
  html: string;
  selector: string;
  styles: RelevantStyles;
  screenshotDataUrl?: string;
  boundingRect: DOMRect;
}

/**
 * Search filters for canvas view.
 */
export interface SearchFilters {
  query?: string;
  domain?: string;
  tags?: string[];
  starred?: boolean;
  dateRange?: {
    start: number;
    end: number;
  };
}

/**
 * Canvas view state for persistence.
 */
export interface CanvasViewState {
  zoom: number;
  position: { x: number; y: number };
  selectedCardIds: string[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error types for better error handling.
 */
export enum ErrorCode {
  STORAGE_FULL = 'STORAGE_FULL',
  INVALID_ELEMENT = 'INVALID_ELEMENT',
  SANITIZATION_FAILED = 'SANITIZATION_FAILED',
  SCREENSHOT_FAILED = 'SCREENSHOT_FAILED',
  API_ERROR = 'API_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Application error with additional context.
 */
export interface AppError {
  code: ErrorCode;
  message: string;
  details?: any;
  timestamp: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Application configuration settings.
 */
export interface AppConfig {
  maxCardSize: number;              // Max HTML size in bytes (10KB)
  maxScreenshotWidth: number;       // Max screenshot width (800px)
  screenshotQuality: number;        // JPEG quality (0.8)
  storageWarningThreshold: number;  // Quota warning at % (0.8)
  autoSaveInterval: number;         // Auto-save interval in ms
  maxConversationLength: number;    // Max messages per conversation
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: AppConfig = {
  maxCardSize: 10 * 1024,           // 10KB
  maxScreenshotWidth: 800,          // 800px
  screenshotQuality: 0.8,           // 80%
  storageWarningThreshold: 0.8,     // 80%
  autoSaveInterval: 2000,           // 2 seconds
  maxConversationLength: 100,       // 100 messages
};
