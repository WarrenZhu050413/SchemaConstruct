/**
 * Types for element-attached chat system
 */

import type { ElementDescriptor } from '@/services/elementIdService';

/**
 * Message in a chat conversation
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  turnId?: string;
  images?: Array<{     // Optional image attachments
    dataURL: string;   // Base64 data URL
    width: number;     // Original width
    height: number;    // Original height
  }>;
}

/**
 * Window state for chat window
 */
export interface ChatWindowState {
  position: { x: number; y: number };
  size: { width: number; height: number };
  collapsed: boolean;
  anchorOffset?: { x: number; y: number };
  queueExpanded?: boolean;
  clearPreviousAssistant?: boolean;
  activeAnchorChatId?: string;
}

/**
 * Complete chat session attached to an element
 */
export interface ElementChatSession {
  /** Unique chat session ID */
  chatId: string;

  /** Element's chat ID (data-nabokov-chat-id) */
  elementId: string;

  /** Page URL where element exists */
  pageUrl: string;

  /** Element descriptor for relocating element */
  elementDescriptor: ElementDescriptor;

  /** Additional descriptors when chat is attached to multiple elements */
  elementDescriptors?: ElementDescriptor[];

  /** Chat IDs for all attached anchors */
  elementIds?: string[];

  /** Chat message history */
  messages: ChatMessage[];

  /** Last window state (position, size, collapsed) */
  windowState?: ChatWindowState;

  /** When chat session was created */
  createdAt: number;

  /** Last time chat was active */
  lastActive: number;
}

/**
 * Storage structure for element chats per page
 * Maps elementId -> ElementChatSession
 */
export interface ElementChatsStorage {
  /** Page URL */
  pageUrl: string;

  /** Map of element ID to chat session */
  sessions: Record<string, ElementChatSession>;

  /** Last updated timestamp */
  lastUpdated: number;
}
