# Styling Audit — Hard-Coded Hex Migration Roadmap

Track progress converting legacy hard-coded hex colors to `var(--token)` references
from `design-tokens.css`. Work file-by-file, highest-visibility first.

## Completed

- [x] `app/league/[id]/PublicLeaguePage.css` — 0 hard-coded hex remaining
- [x] `src/components/league/JoinLeaguePrompt.css` — 0 hard-coded hex remaining

## Priority 1 — High visibility / many hard-coded values

- [ ] **`src/App.css`** (~98 hex occurrences across many sections)
  - [ ] Legal pages (`.legal-page-*`): ~15 values — Tailwind grays (#111827, #374151, #6b7280, etc.)
  - [ ] Table / data display sections: #e0e0e0, #f0f0f0, #fafbfc grays
  - [ ] Error / status states: #dc2626, #b91c1c, #991b1b reds; #10b981 greens
  - [ ] Button variants (leave, danger, indigo): #ef4444, #6366f1, etc.
  - [ ] Session / match config buttons: #dc2626, #f87171, #ccc, #666
  - [ ] Scrollbar theming: #dc2626 error-state scrollbars
  - [ ] Warning / alert boxes: amber (#fef3c7, #92400e), green (#d1fae5, #065f46)
  - [ ] body background gradient: #f7f8f9, #fafbfc

## Priority 2 — Component CSS files

- [ ] **`src/components/notifications/NotificationInbox.css`** (~53 hex values)
  - Uses Tailwind blue (#3b82f6), red (#ef4444), grays (#111827, #9ca3af, #f3f4f6)
- [ ] **`src/components/WhatsAppPage.css`** (~47 hex values)
  - Uses Material colors: #ff9800, #4caf50, #f44336, #333, #666

## Priority 3 — Spot-check remaining files

Run `grep -rn '#[0-9a-fA-F]\{3,8\}' apps/web/src/ --include='*.css'` to find stragglers.

## Rules for migration

1. Map each hex to the closest existing token in `design-tokens.css`
2. If no close match exists, add a new token (with descriptive name + comment)
3. Prefer semantic tokens (e.g., `--danger`) over raw gray tokens where intent is clear
4. Verify visually after each file — zero visual regression goal
