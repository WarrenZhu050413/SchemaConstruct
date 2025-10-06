# Targeted Playwright Recovery Plan

## Context
- Environment: local Playwright runner launched via `tests/fixtures/extension.ts` (Chromium, persistent context).
- Viewport: scaled to ~30% (min 360×200) for faster runs and to expose compact-extension UI.
- Report reference: http://localhost:58064/ from the last full run.

## Failing Suites From Latest Run
1. `tests/e2e/beautification.spec.ts`
2. `tests/e2e/keyboard-shortcuts.spec.ts`
3. `tests/e2e/image-upload.spec.ts`
4. `tests/e2e/font-size-controls.spec.ts`
5. `tests/e2e/stash-operations.spec.ts`
6. `tests/e2e/viewport-persistence.spec.ts`
7. `tests/e2e/multi-element-chat.spec.ts`

## Testing Strategy (Fix → Verify → Commit)
For each suite below:
1. Inspect failing assertions (see report or CLI output).
2. Update product code **or** adjust tests (delete only if feature is obsolete).
3. Run the targeted command:
   ```bash
   npx playwright test tests/e2e/<suite>.spec.ts --reporter=line
   ```
4. Repeat until the spec is green, then move on to the next suite.
5. After a suite is fixed, stage relevant files and make an incremental commit.

## Suite-by-Suite Focus Areas
- **Beautification**: selectors for loading indicator/options, button-disabled state, mock content mutation.
- **Keyboard Shortcuts**: mode indicators, selector activation, inline chat toggle flow.
- **Image Upload**: drag/drop handler coverage and utility assertions.
- **Font Size Controls**: cross-context sync, tooltips, keyboard accessibility.
- **Stash Operations**: badge rendering, delete confirmation, stash image upload.
- **Viewport Persistence**: edge-case coordinate and zoom handling.
- **Multi-Element Chat**: anchor chips, scroll anchoring, Markdown rendering.

## After All Suites Pass
1. Optional sanity run on key smoke specs if desired.
2. Final commit summarising all fixes.
3. Push branch to remote.
