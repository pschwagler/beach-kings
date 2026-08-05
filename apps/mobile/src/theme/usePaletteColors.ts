/**
 * Active-theme palette as plain JS hex values.
 *
 * Used by the ~11 components that bypass Tailwind and consume colors as
 * style values (Button, Input, SearchBar, ListItem, OtpInput,
 * DateOfBirthField, SheetOptionList, plus the three route-group `_layout.tsx`
 * files). Replaces direct `colors`/`darkColors`
 * imports during their migration in Phase 3.9.
 *
 * Returns the canonical light or dark palette based on `useTheme().isDark`.
 * Stable references — same object identity on every render in the same
 * theme — so consumers can safely use it inside memoized style objects.
 */

import { lightPalette, darkPalette } from '@beach-kings/shared/tokens';
import type { SemanticRole } from '@beach-kings/shared/tokens';
import { useTheme } from '@/contexts/ThemeContext';

export type PaletteColors = Readonly<Record<SemanticRole, string>>;

export function usePaletteColors(): PaletteColors {
  const { isDark } = useTheme();
  return isDark ? darkPalette : lightPalette;
}
