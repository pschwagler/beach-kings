/**
 * Theme context for dark mode support.
 * Uses NativeWind's useColorScheme + setColorScheme to drive
 * dark: class variants on native (Appearance API, not className).
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useColorScheme as useNativeWindColorScheme, vars } from 'nativewind';

// Phase 0.1 spike: prove NativeWind v4 vars() drives a CSS-var-backed Tailwind
// class through a live theme toggle. Pre-computed at module scope so the var
// bag isn't recreated on every ThemeProvider render.
const lightSpikeBag = vars({ '--spike-surface': '255 255 255' });
const darkSpikeBag = vars({ '--spike-surface': '22 27 34' });

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

  // Apply default 'system' mode synchronously on mount so the underlying
  // colorScheme tracks Appearance immediately, then reconcile with any
  // persisted preference once secure-store resolves.
  useEffect(() => {
    nwScheme.setColorScheme('system');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await readStoredThemeMode();
      if (cancelled) return;
      if (isThemeMode(stored) && stored !== 'system') {
        setThemeModeState(stored);
        nwScheme.setColorScheme(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDark = resolvedScheme === 'dark';

  const value: ThemeContextValue = {
    colorScheme: resolvedScheme,
    themeMode,
    setThemeMode: handleSetThemeMode,
    isDark,
  };

  return (
    <ThemeContext.Provider value={value}>
      <View style={isDark ? darkSpikeBag : lightSpikeBag} className="flex-1">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
