# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Nabokov Web Clipper** is a Chrome extension for clipping web content and organizing it in a visual canvas. It provides two main features:
1. **Generative Hypertext**: Inline AI-generated hyperlinks and chat tooltips for selected text
2. **Element Clipping**: Save webpage elements to a canvas workspace with AI chat capabilities

## Common Commands

### Development
```bash
npm run dev                    # Start Vite dev server
npm run watch:extension        # Watch mode for extension development
npm run build                  # TypeScript compile + Vite build
npm run build:extension        # Build extension for loading unpacked
npm run package:extension      # Build and package for distribution
```

### Testing
```bash
npm test                       # Run Vitest unit tests
npm run test:watch             # Run tests in watch mode
npm run test:coverage          # Generate test coverage report
npm run test:e2e               # Run Playwright E2E tests
npm run test:e2e:headed        # Run E2E tests in headed mode
npm run test:e2e:debug         # Debug E2E tests
npm run test:all               # Run all tests (unit + E2E)
npm run type-check             # TypeScript type checking
```

### Backend (Optional)
```bash
npm run backend                # Start Node.js backend server
npm run backend:dev            # Start backend with nodemon
```

## Architecture

### Extension Structure
- **Background Script** (`src/background/index.ts`): Service worker handling keyboard commands, context menus, and message routing
- **Content Script** (`src/content/index.tsx`): Injected into web pages, manages Shadow DOM components and user interactions
- **Canvas** (`src/canvas/`): Standalone page for organizing clipped elements with React Flow
- **Side Panel** (`src/sidepanel/`): Chrome side panel for accessing stashed elements and chat history

### Key Architectural Patterns

1. **Shadow DOM Isolation**: All UI components are injected into Shadow DOM to avoid CSS conflicts with host pages
   - See `src/utils/shadowDOM.ts` for Shadow DOM utilities
   - Components use Emotion for scoped styling

2. **Message Passing**: Chrome extension messaging between background, content, and canvas
   - Background listens for keyboard shortcuts and forwards to active tab
   - Content script handles `ACTIVATE_SELECTOR`, `ACTIVATE_CHAT_SELECTOR`, `OPEN_TEXT_SELECTION_CHAT`, etc.

3. **State Management**:
   - Chrome storage (`chrome.storage.local`) for persistent data
   - IndexedDB for large objects (images, chat history)
   - Window state tracked in content script for UI components

4. **Element Selection Modes**:
   - **Canvas mode** (Ctrl+Shift+E): Clip elements to canvas for organization
   - **Stash mode** (Cmd+Shift+E on Mac): Quick-save to side panel
   - **Chat mode** (Ctrl+Shift+C): Open element-attached chat or text-selection chat

### Important Services

- **Element Chat Service** (`src/services/elementChatService.ts`): Persistent chat sessions attached to DOM elements
- **Element ID Service** (`src/services/elementIdService.ts`): Generate stable descriptors for DOM elements
- **Text Selection Highlight Service** (`src/services/textSelectionHighlightService.ts`): Persistent text highlighting with chat
- **Claude API Service** (`src/services/claudeAPIService.ts`): Interface with Anthropic Claude API
- **Card Service** (`src/shared/services/cardService.ts`): Manage clipped cards across canvas and stash

### Testing Strategy

See `AGENTS.md` for Playwright testing guidelines. Key points:
- Use semantic selectors (`getByRole`, `getByLabel`, `getByText`) over CSS selectors
- Prefer auto-waiting assertions (`expect(locator).toBeVisible()`) over timeouts
- Run `npm run build:extension` before E2E tests (extensions require built artifacts)
- Chrome extension tests need headed mode with `--load-extension=dist`

## Build System

- **Vite** with `@crxjs/vite-plugin` for extension development
- **TypeScript** with path aliases (`@/`, `@components/`, `@utils/`, `@types/`)
- Build output: `dist/` directory (git-ignored)

## Development Workflow

1. Make code changes
2. Run `npm run build:extension` to build extension
3. Load unpacked extension from `dist/` in Chrome (`chrome://extensions`)
4. For hot reload during development: use `npm run watch:extension`
5. Run tests with `npm test` (unit) and `npm run test:e2e` (E2E)

## Keyboard Shortcuts

- **Ctrl+Shift+E**: Activate element selector (Canvas mode)
- **Cmd+Shift+E** (Mac) / **Alt+Shift+E**: Activate element selector (Stash mode)
- **Ctrl+Shift+C**: Toggle chat selector (auto-detects text selection vs element)
- **ESC**: Close active selector or chat

## Extension Permissions

Required permissions (see `src/manifest.json`):
- `activeTab`, `storage`, `contextMenus`, `scripting`, `tabs`, `sidePanel`
- `<all_urls>` host permissions for content script injection
