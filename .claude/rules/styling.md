# UI Styling Rules

**Design tokens live in `apps/web/src/design-tokens.css`** — imported via App.css.

## NEVER hard-code hex colors
Use CSS variables from `design-tokens.css`. If a color doesn't exist, add a new token there first.

## Color tokens
See @apps/web/src/design-tokens.css for the full token list.

**Most-used tokens:**

| Token | Use for |
|---|---|
| `--primary` | Buttons, links, accents |
| `--primary-light` | Hover highlights |
| `--primary-dark` | Button hover, active states |
| `--primary-lighter` | Light tinted backgrounds |
| `--gray-900` | Headings, body text |
| `--gray-700` | Secondary text |
| `--gray-600` | Table headers, labels |
| `--ocean-gray` | Muted/tertiary text |
| `--gray-300` | Borders, dividers |
| `--gray-200` | Light borders, badge bg |
| `--gray-100` | Row borders, subtle bg |
| `--gray-50` | Card/row hover bg |
| `--success` | Success states |
| `--danger` | Error/destructive states |

## Component patterns

| Pattern | Rule |
|---|---|
| **Buttons** | Use `<Button>` from `components/ui/UI.jsx`. Variants: default, success, danger, ghost, outline. Do NOT write custom button CSS. |
| **Cards** | `border-radius: 8px`, `border: 1px solid var(--gray-200)`, `background: var(--gray-50)` |
| **Section titles** | `font-size: 18px`, `font-weight: 600`, `border-bottom: 1px solid var(--gray-300)` |
| **Tables** | `th` uses `var(--gray-600)`, `td` uses `var(--gray-900)`, row hover `var(--gray-50)` |
| **Badges** | `border-radius: 12px`, `background: var(--gray-200)`, `color: var(--gray-700)` |
| **Empty states** | Center-aligned, `var(--gray-600)` for description, `var(--gray-900)` for heading |

## Scales

- **Font sizes:** 12 / 13 / 14 / 15 / 16 / 18 / 22-28px
- **Border-radius:** 6 / 8 / 12 / 16 / 20px
- **Spacing:** 8 / 12 / 16 / 20 / 24 / 32 / 40px
- **Shadows:** `var(--shadow-sm)` / `--shadow-md` / `--shadow-lg` / `--shadow-xl` (warm-tinted, no cold black shadows)

## CSS conventions
- BEM naming: `.block__element--modifier`
- No `box-shadow` on buttons (the Button component handles its own states)
- Prefer `var(--gray-*)` over any hand-picked gray hex values
