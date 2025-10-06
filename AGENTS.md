# Repository Guidelines

## Project Structure & Module Organization
- `src/` – React + TypeScript extension code, including `canvas/`, `sidepanel/`, `content/`, shared hooks in `shared/`, and manifest/config in `manifest.json` + `config/`.
- `backend/` – Node service (Claude Agent SDK) powering subscription auth; runs independently from the extension bundle.
- `tests/` – Automated suites (`unit/`, `e2e/`, `fixtures/`, `utils/`) aligned with Vitest and Playwright.
- `test-scripts/` – Manual Playwright runners and helpers for canvas or side panel checks.
- `docs/` – Architecture, testing, and project status references; update alongside feature work.
- `scripts/` & `public/` – Build helpers and static assets; `archive/` keeps deprecated experiments.

## Build, Test, and Development Commands
```bash
npm install             # Install workspace dependencies
npm run dev            # Vite dev server for canvas + sidepanel UIs
npm run watch:extension # Incremental extension build (dist/)
npm run backend:dev    # Nodemon backend at http://localhost:3100
npm test               # Vitest unit suite
npm run test:e2e       # Playwright E2E (requires built extension)
npm run type-check     # Strict TypeScript verification

### Playwright Reporter
- For local runs, append `-- --reporter line` to `npm run test:e2e` for concise streaming output.
```

## Coding Style & Naming Conventions
- TypeScript strict mode; prefer functional React components with explicit props types.
- Two-space indentation, semicolons, and single quotes match existing files; lint via TypeScript and Vitest assertions (no Prettier config).
- Components use PascalCase (`CardNode.tsx`), hooks and utilities use camelCase (`useCanvasState.ts`, `windowManager`), and shared assets live under `src/shared/` to avoid duplication.
- Respect path aliases (`@/`, `@components/`, `@utils/`, `@types/`) instead of long relative imports.

## Testing Guidelines
- Unit tests reside in `tests/unit/` and may import helpers from `tests/utils/`; co-locate new fixtures under `tests/fixtures/`.
- Keep E2E coverage in `tests/e2e/`; rebuild the extension (`npm run build`) before running Playwright to ensure fresh artifacts.
- Use `npm run test:coverage` to populate `coverage/`; investigate regressions before merging.
- For manual verification, adapt scripts under `test-scripts/tests/` and capture evidence in `test-results/` when behavior changes.

## Commit & Pull Request Guidelines
- Follow Conventional Commits observed in history (`feat:`, `fix:`, `docs:`); scope optional but helpful.
- Include succinct summaries, list test commands executed, and attach screenshots/GIFs for UI-visible changes (canvas, side panel, inline chat).
- Cross-link relevant docs or issues, and note backend impacts when touching `backend/` or Claude integration.

## Backend & Configuration Tips
- Backend reads `ANTHROPIC_API_KEY` when set; otherwise rely on Claude subscription—document which path you exercised during testing.
- Update `src/services/claudeAPIService.ts` if backend URL changes, and keep `backend/start-backend.sh` scripts executable when editing.
