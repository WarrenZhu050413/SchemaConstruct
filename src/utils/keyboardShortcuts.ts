/**
 * Keyboard Shortcuts Utility
 *
 * Provides a centralized system for managing keyboard shortcuts across the application.
 * Supports platform-specific modifiers (Cmd on Mac, Ctrl on Windows/Linux).
 */

export type ShortcutCategory = 'navigation' | 'canvas' | 'filters' | 'view';

export interface KeyboardShortcut {
  id: string;
  key: string;
  modifier?: 'ctrl' | 'alt' | 'shift' | 'meta';
  description: string;
  category: ShortcutCategory;
  handler: () => void;
  enabled?: boolean;
}

export interface ShortcutConfig {
  [key: string]: {
    key: string;
    modifier?: 'ctrl' | 'alt' | 'shift' | 'meta';
    enabled: boolean;
  };
}

/**
 * Detect if running on macOS
 */
export function isMac(): boolean {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/**
 * Get the appropriate modifier key name for the current platform
 */
export function getModifierKey(): 'Cmd' | 'Ctrl' {
  return isMac() ? 'Cmd' : 'Ctrl';
}

/**
 * Convert modifier string to readable format
 */
export function formatModifier(modifier?: string): string {
  if (!modifier) return '';

  switch (modifier) {
    case 'ctrl':
      return 'Ctrl';
    case 'alt':
      return 'Alt';
    case 'shift':
      return 'Shift';
    case 'meta':
      return isMac() ? 'Cmd' : 'Ctrl';
    default:
      return modifier;
  }
}

/**
 * Format a keyboard shortcut for display
 */
export function formatShortcut(key: string, modifier?: string): string {
  const modifierStr = formatModifier(modifier);
  const keyStr = key.length === 1 ? key.toUpperCase() : key;

  return modifier ? `${modifierStr}+${keyStr}` : keyStr;
}

/**
 * Check if a keyboard event matches a shortcut definition
 */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcut: { key: string; modifier?: string }
): boolean {
  const key = event.key.toLowerCase();
  const shortcutKey = shortcut.key.toLowerCase();

  // Check if the key matches
  if (key !== shortcutKey) return false;

  // Check modifier keys
  if (shortcut.modifier === 'ctrl' && !event.ctrlKey) return false;
  if (shortcut.modifier === 'alt' && !event.altKey) return false;
  if (shortcut.modifier === 'shift' && !event.shiftKey) return false;
  if (shortcut.modifier === 'meta' && !(event.metaKey || event.ctrlKey)) return false;

  // Ensure no other modifiers are pressed (unless it's part of the shortcut)
  if (!shortcut.modifier) {
    if (event.ctrlKey || event.altKey || event.metaKey) return false;
  }

  return true;
}

/**
 * Check if an element should prevent keyboard shortcuts
 */
export function shouldPreventShortcut(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  const isContentEditable = target.contentEditable === 'true' || target.isContentEditable === true;

  return isInput || isContentEditable;
}

/**
 * Default keyboard shortcuts configuration
 */
export const DEFAULT_SHORTCUTS: Record<string, Omit<KeyboardShortcut, 'handler'>> = {
  focusSearch: {
    id: 'focusSearch',
    key: 'k',
    modifier: 'meta',
    description: 'Focus search input',
    category: 'navigation',
    enabled: true,
  },
  toggleFilter: {
    id: 'toggleFilter',
    key: 'f',
    modifier: 'meta',
    description: 'Toggle filter panel',
    category: 'filters',
    enabled: true,
  },
  createNote: {
    id: 'createNote',
    key: 'n',
    modifier: 'meta',
    description: 'Create new note',
    category: 'canvas',
    enabled: true,
  },
  toggleConnectionMode: {
    id: 'toggleConnectionMode',
    key: 'c',
    description: 'Toggle connection mode',
    category: 'canvas',
    enabled: true,
  },
  deleteSelection: {
    id: 'deleteSelection',
    key: 'Delete',
    description: 'Delete selected cards',
    category: 'canvas',
    enabled: true,
  },
  deleteSelectionAlt: {
    id: 'deleteSelectionAlt',
    key: 'Backspace',
    description: 'Delete selected cards',
    category: 'canvas',
    enabled: true,
  },
  escape: {
    id: 'escape',
    key: 'Escape',
    description: 'Clear search / Close modals',
    category: 'navigation',
    enabled: true,
  },
  showHelp: {
    id: 'showHelp',
    key: '?',
    description: 'Show keyboard shortcuts help',
    category: 'navigation',
    enabled: true,
  },
  toggleStarred: {
    id: 'toggleStarred',
    key: 's',
    description: 'Toggle starred filter',
    category: 'filters',
    enabled: true,
  },
  fitView: {
    id: 'fitView',
    key: 'f',
    description: 'Fit all cards in view',
    category: 'view',
    enabled: true,
  },
  zoomIn: {
    id: 'zoomIn',
    key: '=',
    modifier: 'meta',
    description: 'Zoom in',
    category: 'view',
    enabled: true,
  },
  zoomOut: {
    id: 'zoomOut',
    key: '-',
    modifier: 'meta',
    description: 'Zoom out',
    category: 'view',
    enabled: true,
  },
  tag1: {
    id: 'tag1',
    key: '1',
    description: 'Quick filter by tag 1',
    category: 'filters',
    enabled: true,
  },
  tag2: {
    id: 'tag2',
    key: '2',
    description: 'Quick filter by tag 2',
    category: 'filters',
    enabled: true,
  },
  tag3: {
    id: 'tag3',
    key: '3',
    description: 'Quick filter by tag 3',
    category: 'filters',
    enabled: true,
  },
  tag4: {
    id: 'tag4',
    key: '4',
    description: 'Quick filter by tag 4',
    category: 'filters',
    enabled: true,
  },
  tag5: {
    id: 'tag5',
    key: '5',
    description: 'Quick filter by tag 5',
    category: 'filters',
    enabled: true,
  },
  tag6: {
    id: 'tag6',
    key: '6',
    description: 'Quick filter by tag 6',
    category: 'filters',
    enabled: true,
  },
  tag7: {
    id: 'tag7',
    key: '7',
    description: 'Quick filter by tag 7',
    category: 'filters',
    enabled: true,
  },
  tag8: {
    id: 'tag8',
    key: '8',
    description: 'Quick filter by tag 8',
    category: 'filters',
    enabled: true,
  },
  tag9: {
    id: 'tag9',
    key: '9',
    description: 'Quick filter by tag 9',
    category: 'filters',
    enabled: true,
  },
};

/**
 * Storage key for shortcuts configuration
 */
const SHORTCUTS_STORAGE_KEY = 'nabokov_shortcuts_config';

/**
 * Load shortcuts configuration from storage
 */
export async function loadShortcutsConfig(): Promise<ShortcutConfig> {
  try {
    const result = await chrome.storage.local.get(SHORTCUTS_STORAGE_KEY);
    return result[SHORTCUTS_STORAGE_KEY] || {};
  } catch (error) {
    console.error('Failed to load shortcuts config:', error);
    return {};
  }
}

/**
 * Save shortcuts configuration to storage
 */
export async function saveShortcutsConfig(config: ShortcutConfig): Promise<void> {
  try {
    await chrome.storage.local.set({ [SHORTCUTS_STORAGE_KEY]: config });
  } catch (error) {
    console.error('Failed to save shortcuts config:', error);
    throw error;
  }
}

/**
 * Merge default shortcuts with user configuration
 */
export function mergeShortcutsConfig(
  userConfig: ShortcutConfig
): Record<string, Omit<KeyboardShortcut, 'handler'>> {
  const merged = { ...DEFAULT_SHORTCUTS };

  Object.entries(userConfig).forEach(([id, config]) => {
    if (merged[id]) {
      merged[id] = {
        ...merged[id],
        key: config.key,
        modifier: config.modifier,
        enabled: config.enabled,
      };
    }
  });

  return merged;
}

/**
 * Keyboard shortcut manager class
 */
export class KeyboardShortcutManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private enabled = true;
  private listener: ((event: KeyboardEvent) => void) | null = null;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Register a keyboard shortcut
   */
  register(shortcut: KeyboardShortcut): void {
    this.shortcuts.set(shortcut.id, shortcut);
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  /**
   * Get a registered shortcut
   */
  get(id: string): KeyboardShortcut | undefined {
    return this.shortcuts.get(id);
  }

  /**
   * Get all registered shortcuts
   */
  getAll(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcuts by category
   */
  getByCategory(category: ShortcutCategory): KeyboardShortcut[] {
    return this.getAll().filter(s => s.category === category);
  }

  /**
   * Enable or disable the shortcut manager
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Start listening for keyboard events
   */
  start(): void {
    if (this.listener) return;

    this.listener = this.handleKeyDown;
    document.addEventListener('keydown', this.listener);
  }

  /**
   * Stop listening for keyboard events
   */
  stop(): void {
    if (this.listener) {
      document.removeEventListener('keydown', this.listener);
      this.listener = null;
    }
  }

  /**
   * Handle keyboard events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    // Don't trigger shortcuts when typing in inputs
    if (shouldPreventShortcut(event.target)) {
      // Exception: Allow Escape key in inputs
      if (event.key !== 'Escape') return;
    }

    // Find matching shortcut
    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.enabled === false) continue;

      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        event.stopPropagation();

        try {
          shortcut.handler();
        } catch (error) {
          console.error(`Error executing shortcut ${shortcut.id}:`, error);
        }

        break;
      }
    }
  }
}

/**
 * Global keyboard shortcut manager instance
 */
export const globalShortcutManager = new KeyboardShortcutManager();