/**
 * Tailwind color map for the semantic theme tokens.
 *
 * Returns an object whose values reference CSS variables via Tailwind's
 * `<alpha-value>` placeholder. NativeWind v4 evaluates these against the
 * vars() bag mounted by the ThemeProvider, so each Tailwind class
 * (`bg-surface`, `text-muted`, …) resolves to the active theme's value.
 *
 * Usage in apps/mobile/tailwind.config.ts:
 *
 *   import { semanticColors } from '@beach-kings/shared/tailwind/semantic-colors';
 *   theme: { extend: { colors: { ...semanticColors() } } }
 */

import { SEMANTIC_ROLES, cssVarName, tailwindClassName } from '../tokens/semantic';

/**
 * Build the Tailwind colors fragment for semantic roles.
 *
 * Each role becomes a class basename (e.g. `surface` → `bg-surface`,
 * `default` → `text-default`) mapped to `rgb(var(--…) / <alpha-value>)`.
 */
export function semanticColors(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of SEMANTIC_ROLES) {
    const className = tailwindClassName(role);
    out[className] = `rgb(var(${cssVarName(role)}) / <alpha-value>)`;
  }
  return out;
}
