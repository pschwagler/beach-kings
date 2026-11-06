import type { CSSProperties } from 'react';
import { lightPalette, darkPalette, cssVarName, type SemanticRole } from '@beach-kings/shared/tokens';

// Reuse the mobile palette without changing the rest of the web theme.
const roles = [
  'bgPage', 'bgSurface', 'bgInset', 'textDefault', 'textMuted', 'textTertiary',
  'brandTeal', 'brandGold', 'onBrandGold', 'borderStrong',
  'danger', 'dangerTint', 'success', 'successTint',
] as const satisfies readonly SemanticRole[];

export const authTheme = Object.fromEntries(roles.map(role => [
  `--auth${cssVarName(role).slice(1)}`,
  `light-dark(${lightPalette[role]}, ${darkPalette[role]})`,
])) as CSSProperties;
