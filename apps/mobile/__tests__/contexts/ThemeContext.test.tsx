/**
 * Tests for ThemeContext provider and useTheme hook.
 * Covers light/dark/system mode switching and isDark flag.
 */

import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { renderHook, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mock nativewind
// ---------------------------------------------------------------------------

const mockSetColorScheme = jest.fn();
let mockColorScheme: 'light' | 'dark' | null = 'light';

jest.mock('nativewind', () => ({
  useColorScheme: () => ({
    colorScheme: mockColorScheme,
    setColorScheme: mockSetColorScheme,
  }),
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import ThemeProvider, { useTheme } from '@/contexts/ThemeContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  return <ThemeProvider>{children}</ThemeProvider>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTheme', () => {
  it('throws when used outside ThemeProvider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(
      'useTheme must be used within a ThemeProvider',
    );
    consoleError.mockRestore();
  });
});

describe('ThemeProvider — initial state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockColorScheme = 'light';
  });

  it('starts with themeMode "system"', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.themeMode).toBe('system');
  });

  it('calls setColorScheme("system") on mount', () => {
    renderHook(() => useTheme(), { wrapper });
    expect(mockSetColorScheme).toHaveBeenCalledWith('system');
  });

  it('reports colorScheme as "light" when nativewind returns light', () => {
    mockColorScheme = 'light';
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.colorScheme).toBe('light');
    expect(result.current.isDark).toBe(false);
  });

  it('reports colorScheme as "dark" when nativewind returns dark', () => {
    mockColorScheme = 'dark';
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.colorScheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('falls back to "light" when nativewind colorScheme is null', () => {
    mockColorScheme = null;
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.colorScheme).toBe('light');
    expect(result.current.isDark).toBe(false);
  });
});

describe('ThemeProvider — setThemeMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockColorScheme = 'light';
  });

  it('updates themeMode to "dark"', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setThemeMode('dark');
    });

    expect(result.current.themeMode).toBe('dark');
  });

  it('calls nativewind setColorScheme with the new mode', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    // Clear the call from mount
    mockSetColorScheme.mockClear();

    act(() => {
      result.current.setThemeMode('dark');
    });

    expect(mockSetColorScheme).toHaveBeenCalledWith('dark');
  });

  it('updates themeMode to "light"', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setThemeMode('light');
    });

    expect(result.current.themeMode).toBe('light');
    expect(mockSetColorScheme).toHaveBeenCalledWith('light');
  });

  it('updates themeMode back to "system"', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setThemeMode('dark');
    });
    act(() => {
      result.current.setThemeMode('system');
    });

    expect(result.current.themeMode).toBe('system');
    expect(mockSetColorScheme).toHaveBeenLastCalledWith('system');
  });
});

describe('ThemeProvider — renders children', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockColorScheme = 'light';
  });

  it('renders children without errors', () => {
    const { getByText } = render(
      <ThemeProvider>
        <Text>child content</Text>
      </ThemeProvider>,
    );
    expect(getByText('child content')).toBeTruthy();
  });
});
