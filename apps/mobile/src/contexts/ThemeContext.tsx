/**
 * Theme context for dark mode support.
 * Uses NativeWind's useColorScheme + setColorScheme to drive
 * dark: class variants on native (Appearance API, not className).
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  readonly colorScheme: 'light' | 'dark';
  readonly themeMode: ThemeMode;
  readonly setThemeMode: (mode: ThemeMode) => void;
  readonly isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Hook to access theme state.
 * Must be used within ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

interface ThemeProviderProps {
  readonly children: React.ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps): React.ReactNode {
  const nwScheme = useNativeWindColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  const resolvedScheme: 'light' | 'dark' = nwScheme.colorScheme ?? 'light';

  const handleSetThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    nwScheme.setColorScheme(mode);
  }, [nwScheme]);

  // Sync initial mode on mount
  useEffect(() => {
    nwScheme.setColorScheme('system');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value: ThemeContextValue = {
    colorScheme: resolvedScheme,
    themeMode,
    setThemeMode: handleSetThemeMode,
    isDark: resolvedScheme === 'dark',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
