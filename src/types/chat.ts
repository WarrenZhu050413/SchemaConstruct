/**
 * Unified Chat Types
 * Single source of truth for all chat interfaces in NabokovsWeb
 */

/**
 * Base message interface - used across all chat contexts
 * Supports both text-only and multimodal (text + images) messages
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
  parentId?: string;

  // Multimodal support (for vision API)
  images?: Array<{
    dataURL: string;      // "data:image/png;base64,..."
    width: number;        // Original dimensions
    height: number;
  }>;
  thinking?: string;      // Optional assistant reasoning section
}

/**
 * Conversation context for any chat interface
 * Unifies storage across card chats, page chats, and hypertext sessions
 */
export interface ConversationContext {
  id: string; // Conversation ID (could be cardId, sessionId, etc)
  type: 'card' | 'page' | 'element' | 'hypertext';
  messages: Message[];
  metadata: {
    title: string;
    url?: string;
    contextData?: string; // Serialized context for LLM
  };
}

/**
 * Common chat interface for all UI implementations
 * Defines standard contract for ChatModal, FloatingWindow, InlineChatWindow
 */
export interface ChatInterface {
  // State
  messages: Message[];
  isStreaming: boolean;
  currentInput: string;

  // Actions
  sendMessage: (content: string, images?: Message['images']) => Promise<void>;
  clearMessages: () => Promise<void>;
  saveConversation: (destination: 'canvas' | 'stash') => Promise<void>;

  // Lifecycle
  onClose?: () => void;
  onSave?: (conversation: ConversationContext) => Promise<void>;
}

/**
 * Streaming response chunk from LLM
 */
export interface StreamChunk {
  type: 'content_block_start' | 'content_block_delta' | 'content_block_stop';
  delta?: {
    text: string;
  };
}
