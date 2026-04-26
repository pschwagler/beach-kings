/**
 * Pre-computed NativeWind var() bags for the active theme.
 *
 * `vars()` returns a style object that NativeWind v4 mounts at a parent
 * <View>; descendants resolve `rgb(var(--…) / <alpha-value>)` against
 * those values. We compute light + dark bags once at module load so the
 * ThemeProvider doesn't allocate fresh objects on every render.
 */

import { vars } from 'nativewind';
import { lightVars, darkVars } from '@beach-kings/shared/tokens';

export const lightVarBag = vars(lightVars);
export const darkVarBag = vars(darkVars);
