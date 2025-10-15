# Playwright Testing Reference for Agents

This document summarizes the Playwright testing guidelines collected in `~/.claude/snippets/snippets/playwright-testing.md` and `~/.claude/snippets/snippets/playwright_chrome_extensions.md`. Use it as the single source of truth when authoring, diagnosing, or stabilizing Playwright suites for the NabokovsWeb extension.

## Selector Strategy
- Prefer semantic queries (`page.getByRole`, `page.getByLabel`, `page.getByPlaceholder`, `page.getByText`).
- Fall back to stable `data-testid` attributes when semantics are unavailable.
- Avoid brittle CSS/XPath selectors (e.g., `.class:nth-child(3)`).
- Compose fallback selectors when necessary, but never rely on dynamic class names.

## Assertions & Waiting
- Use Playwright’s auto-waiting expectations (`await expect(locator).toBeVisible()` etc.) instead of manual `waitForTimeout`.
- Wait on selectors, network events, or URLs as needed (`waitForSelector`, `waitForResponse`, `waitForURL`).
- Prohibit arbitrary sleeps; any deterministic delay must be event driven.

## Fixtures & Structure
- Extend the base `test` to provide shared fixtures (e.g., reusable pages, authenticated contexts).
- Keep page-object style helpers when interaction flows become complex; ensure helper methods include their own assertions.
- Name tests descriptively (`test('user can add card and stash it', ...)`).
- Clean up in fixtures’ `use` blocks so state is reset between cases (e.g., remove created entities, close contexts).
- Prefer page objects or helper modules over repeating raw locator logic inside each test body.

## Chrome Extension Essentials
- Launch Chromium with `launchPersistentContext('', { headless: false, args: ['--disable-extensions-except=dist', '--load-extension=dist'] })` – extensions require headed mode.
- Derive the runtime extension ID from the service worker or `chrome.runtime.id` when the tests need to reach chrome-extension URLs.
- Always run `npm run build:extension` before Playwright E2E runs to guarantee the unpacked build exists.

## Stability Tips
- Capture console logs (`page.on('console', ...)`) when debugging failing specs; remove noisy logs once stabilized.
- When interacting with the overlay, re-map clicks from the testing overlay to the underlying DOM element (use `document.elementFromPoint`).
- Persist automation-only hooks behind `navigator.webdriver` / `__NABOKOV_TEST_MODE__` so user behaviour remains unchanged.
- Use `context.tracing.start/stop` with screenshots & snapshots when a failure needs deeper insight; analyze the resulting trace via `npx playwright show-trace`.
- Keep tests idempotent: the suite must succeed when rerun against the same workspace without manual resets.

## Performance & Parallelism
- Where authentication is required, pre-record state (`context.storageState`) and reuse it inside fixtures.
- Let Playwright’s worker count default to parallel mode locally; in CI cap workers (e.g., `workers: process.env.CI ? 2 : undefined`).
- Avoid excessive parallel work in areas that share mutable state unless the suite explicitly isolates via per-test contexts.

## Common Anti-Patterns (Avoid)
- Arbitrary sleeps (`waitForTimeout`) instead of event-driven waits.
- Fragile selectors (nth-child chains, dynamic class names) and assertions on implementation details.
- Tests that mutate shared backend state without cleanup or determinism.
- Hitting real external services when mocks or fixtures can stand in.

## Agent Workflow Reference
- **Plan** with `playwright-test-planner` to map new flows before coding.
- **Generate** with `playwright-test-generator` when turning a plan into code.
- **Heal** with `playwright-test-healer` to diagnose and repair regressions.
- Use the Task tool’s `subagent_type` to invoke the desired agent; record outcomes here once stabilized.

Keep this file up to date when new best practices emerge. Any automation agent referencing testing policy should link back here.
