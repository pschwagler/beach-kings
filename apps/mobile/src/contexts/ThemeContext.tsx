/**
 * Theme context for dark mode support.
 * Uses NativeWind's useColorScheme + setColorScheme to drive
 * dark: class variants on native (Appearance API, not className).
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';

type ThemeMode = 'light' | 'dark' | 'system';

const THEME_MODE_KEY = 'beach_theme_mode';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Lazily loads expo-secure-store to keep it out of the module graph for
 * environments where the native module isn't available (e.g. web, jest).
 * Returns null on any failure so persistence becomes a best-effort no-op.
 */
function getSecureStore(): typeof import('expo-secure-store') | null {
  try {
    return require('expo-secure-store') as typeof import('expo-secure-store');
  } catch {
    return null;
  }
}

async function readStoredThemeMode(): Promise<string | null> {
  const store = getSecureStore();
  if (!store) return null;
  try {
    return await store.getItemAsync(THEME_MODE_KEY);
  } catch {
    return null;
  }
}

async function writeStoredThemeMode(mode: ThemeMode): Promise<void> {
  const store = getSecureStore();
  if (!store) return;
  try {
    await store.setItemAsync(THEME_MODE_KEY, mode);
  } catch {
    // best-effort persistence
  }
}

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
    void writeStoredThemeMode(mode);
  }, [nwScheme]);

  // Load persisted mode on mount, falling back to 'system'
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readStoredThemeMode();
      if (cancelled) return;
      const mode: ThemeMode = isThemeMode(stored) ? stored : 'system';
      setThemeModeState(mode);
      nwScheme.setColorScheme(mode);
    })();
    return () => {
      cancelled = true;
    };
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
