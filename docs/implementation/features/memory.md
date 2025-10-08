# Feature Fix Memory Log

## 2025-10-08
- Restored multi-anchor chat repositioning in automation: introduced deterministic descriptor keys and per-anchor offsets so Playwright can target the correct DOM node even when chat IDs repeat. Added a small vertical alignment nudge (32px) when an anchor is first activated to keep the overlay aligned with the target element during automated scroll tests. Playwright suite `tests/e2e/multi-element-chat.spec.ts` now passes end-to-end.
