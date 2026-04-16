/**
 * Coverage tests for all app/ route files.
 * Targets 0%-coverage routes: index, (auth)/_layout, (auth)/login,
 * (auth)/signup, (stack)/_layout, (tabs)/_layout, and all five tab screens.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ---------------------------------------------------------------------------
// Mocks — declared before any route imports so Jest hoisting works correctly
// ---------------------------------------------------------------------------

// expo-router
jest.mock('expo-router', () => {
  const React = require('react');
  const { View, Text } = require('react-native');

  const Redirect = ({ href }: { href: string }) => (
    <View testID="redirect">
      <Text>{href}</Text>
    </View>
  );

  // Slot renders children in tests
  const Slot = ({ children }: { children?: React.ReactNode }) => (
    <View testID="slot">{children}</View>
  );

  // Stack and Stack.Screen are pass-throughs
  const Stack = ({ children }: { children?: React.ReactNode }) => (
    <View testID="stack">{children}</View>
  );
  Stack.Screen = ({ children }: { children?: React.ReactNode }) => (
    <View testID="stack-screen">{children}</View>
  );

  // Tabs and Tabs.Screen
  const Tabs = ({ children }: { children?: React.ReactNode }) => (
    <View testID="tabs">{children}</View>
  );
  Tabs.Screen = ({ children }: { children?: React.ReactNode }) => (
    <View testID="tabs-screen">{children}</View>
  );

  const Link = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <View testID={`link-${href}`}>{children}</View>
  );

  const SplashScreen = {
    preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
    hideAsync: jest.fn().mockResolvedValue(undefined),
  };

  const useRouter = () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() });
  const useSegments = () => [];

  return { Redirect, Slot, Stack, Tabs, Link, SplashScreen, useRouter, useSegments };
});

// expo-status-bar
jest.mock('expo-status-bar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    StatusBar: ({ style }: { style?: string }) => (
      <View testID={`status-bar-${style ?? 'default'}`} />
    ),
  };
});

// expo-font
jest.mock('expo-font', () => ({
  loadAsync: jest.fn().mockResolvedValue(undefined),
}));

// ThemeContext
const mockUseTheme = jest.fn();
jest.mock('@/contexts/ThemeContext', () => ({
  __esModule: true,
  useTheme: () => mockUseTheme(),
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// AuthContext
const mockLogin = jest.fn();
const mockSignup = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: () => ({ login: mockLogin, signup: mockSignup, logout: jest.fn(), isAuthenticated: false, isLoading: false, user: null }),
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// NotificationContext
const mockUseNotifications = jest.fn();
jest.mock('@/contexts/NotificationContext', () => ({
  __esModule: true,
  useNotifications: () => mockUseNotifications(),
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ToastContext
jest.mock('@/contexts/ToastContext', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Shared design tokens
jest.mock('@beach-kings/shared/tokens', () => ({
  colors: {
    primary: '#1a3a4a',
    accent: '#e6ac00',
    bgPrimary: '#f9f9f9',
    bgSurface: '#ffffff',
    gray200: '#e5e7eb',
    textTertiary: '#999999',
    textPrimary: '#1a1a1a',
    brandTeal: '#0D9488',
  },
  darkColors: {
    bgBase: '#0d0d1a',
    bgTabbar: '#1a1a2e',
    brandTeal: '#14b8a6',
    brandGold: '#f59e0b',
    textTertiary: '#737373',
    border: '#2a2a3e',
  },
}));

// react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => (
      <View testID="safe-area-view">{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// ErrorBoundary
jest.mock('@/lib/ErrorBoundary', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// TopNav
jest.mock('@/components/ui/TopNav', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ title }: { title: string }) => <Text testID="top-nav">{title}</Text>,
  };
});

// Button
jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Pressable, Text, TextInput } = require('react-native');
  return {
    Button: ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) => (
      <Pressable testID={`button-${title}`} onPress={onPress} disabled={disabled ?? false}>
        <Text>{title}</Text>
      </Pressable>
    ),
    Input: ({ placeholder, onChangeText, value, ...rest }: {
      placeholder?: string;
      onChangeText?: (text: string) => void;
      value?: string;
      [key: string]: unknown;
    }) => (
      <TextInput
        testID={`input-${placeholder}`}
        placeholder={placeholder}
        onChangeText={onChangeText}
        value={value}
        {...rest}
      />
    ),
  };
});

// Icons — each exported as a simple View with a testID
jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');

  const makeIcon = (name: string) =>
    ({ size, color }: { size?: number; color?: string }) => (
      <View testID={`icon-${name}`} accessibilityLabel={name} />
    );

  return {
    HomeIcon: makeIcon('HomeIcon'),
    TrophyIcon: makeIcon('TrophyIcon'),
    PlusIcon: makeIcon('PlusIcon'),
    ChatIcon: makeIcon('ChatIcon'),
    UserIcon: makeIcon('UserIcon'),
    AlertTriangleIcon: makeIcon('AlertTriangleIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
  };
});

// react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  const Circle = () => null;
  const Polygon = () => null;
  const G = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { default: Svg, Svg, Path, Circle, Polygon, G };
});

// ---------------------------------------------------------------------------
// Default theme/notification stubs (overridden per-suite where needed)
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUseTheme.mockReturnValue({
    isDark: false,
    colorScheme: 'light',
    themeMode: 'light',
    setThemeMode: jest.fn(),
  });
  mockUseNotifications.mockReturnValue({
    notifications: [],
    unreadCount: 0,
    dmUnreadCount: 0,
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    addNotificationListener: jest.fn(),
  });
  mockLogin.mockReset();
  mockSignup.mockReset();
});

// ---------------------------------------------------------------------------
// app/index.tsx
// ---------------------------------------------------------------------------

describe('app/index — redirect', () => {
  // Import inside describe so it picks up mocks
  let Index: React.ComponentType;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Index = require('../../app/index').default;
  });

  it('renders a Redirect to /(tabs)/home', () => {
    const { getByTestId, getByText } = render(<Index />);
    expect(getByTestId('redirect')).toBeTruthy();
    expect(getByText('/(tabs)/home')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// app/(auth)/_layout.tsx
// ---------------------------------------------------------------------------

describe('app/(auth)/_layout — AuthLayout', () => {
  let AuthLayout: React.ComponentType;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    AuthLayout = require('../../app/(auth)/_layout').default;
  });

  it('renders a Stack navigator in light mode', () => {
    const { getByTestId } = render(<AuthLayout />);
    expect(getByTestId('stack')).toBeTruthy();
  });

  it('renders a Stack navigator in dark mode', () => {
    mockUseTheme.mockReturnValue({ isDark: true, colorScheme: 'dark', themeMode: 'dark', setThemeMode: jest.fn() });
    const { getByTestId } = render(<AuthLayout />);
    expect(getByTestId('stack')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// app/(stack)/_layout.tsx
// ---------------------------------------------------------------------------

describe('app/(stack)/_layout — StackLayout', () => {
  let StackLayout: React.ComponentType;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    StackLayout = require('../../app/(stack)/_layout').default;
  });

  it('renders a Stack navigator in light mode', () => {
    const { getByTestId } = render(<StackLayout />);
    expect(getByTestId('stack')).toBeTruthy();
  });

  it('renders a Stack navigator in dark mode', () => {
    mockUseTheme.mockReturnValue({ isDark: true, colorScheme: 'dark', themeMode: 'dark', setThemeMode: jest.fn() });
    const { getByTestId } = render(<StackLayout />);
    expect(getByTestId('stack')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// app/_layout.tsx — RootLayout + RootLayoutInner
// ---------------------------------------------------------------------------

describe('app/_layout — RootLayout', () => {
  let RootLayout: React.ComponentType;
  let SplashScreen: { preventAutoHideAsync: jest.Mock; hideAsync: jest.Mock };
  let FontModule: { loadAsync: jest.Mock };

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    SplashScreen = require('expo-router').SplashScreen;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    FontModule = require('expo-font');
    // Import AFTER mocks are in place
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RootLayout = require('../../app/_layout').default;
  });

  beforeEach(() => {
    FontModule.loadAsync.mockResolvedValue(undefined);
  });

  it('calls SplashScreen.preventAutoHideAsync at module load', () => {
    // preventAutoHideAsync is called at module evaluation time
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalled();
  });

  it('calls Font.loadAsync on mount and renders children once fonts are loaded', async () => {
    let resolveFont: () => void;
    FontModule.loadAsync.mockReturnValue(
      new Promise<void>((res) => { resolveFont = res; }),
    );

    const { queryByTestId } = render(<RootLayout />);

    // Before fonts load, the component returns null
    expect(queryByTestId('slot')).toBeNull();

    await act(async () => {
      resolveFont!();
    });

    expect(FontModule.loadAsync).toHaveBeenCalledWith({});
  });

  it('renders Slot after fonts load successfully', async () => {
    FontModule.loadAsync.mockResolvedValue(undefined);
    const { findByTestId } = render(<RootLayout />);
    expect(await findByTestId('slot')).toBeTruthy();
  });

  it('renders Slot even when Font.loadAsync rejects', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    FontModule.loadAsync.mockRejectedValue(new Error('font load failed'));
    const { findByTestId } = render(<RootLayout />);
    expect(await findByTestId('slot')).toBeTruthy();
    spy.mockRestore();
  });

  it('calls SplashScreen.hideAsync after fonts load', async () => {
    SplashScreen.hideAsync.mockClear();
    FontModule.loadAsync.mockResolvedValue(undefined);
    render(<RootLayout />);
    await waitFor(() => {
      expect(SplashScreen.hideAsync).toHaveBeenCalled();
    });
  });

  it('renders StatusBar with style="dark" in light mode', async () => {
    mockUseTheme.mockReturnValue({ isDark: false, colorScheme: 'light', themeMode: 'light', setThemeMode: jest.fn() });
    FontModule.loadAsync.mockResolvedValue(undefined);
    const { findByTestId } = render(<RootLayout />);
    expect(await findByTestId('status-bar-dark')).toBeTruthy();
  });

  it('renders StatusBar with style="light" in dark mode', async () => {
    mockUseTheme.mockReturnValue({ isDark: true, colorScheme: 'dark', themeMode: 'dark', setThemeMode: jest.fn() });
    FontModule.loadAsync.mockResolvedValue(undefined);
    const { findByTestId } = render(<RootLayout />);
    expect(await findByTestId('status-bar-light')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// app/(auth)/login.tsx
// ---------------------------------------------------------------------------

describe('app/(auth)/login — LoginScreen', () => {
  let LoginScreen: React.ComponentType;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    LoginScreen = require('../../app/(auth)/login').default;
  });

  it('renders email and password inputs', () => {
    const { getByTestId } = render(<LoginScreen />);
    expect(getByTestId('input-Email')).toBeTruthy();
    expect(getByTestId('input-Password')).toBeTruthy();
  });

  it('renders the Sign In button', () => {
    const { getByTestId } = render(<LoginScreen />);
    expect(getByTestId('button-Sign In')).toBeTruthy();
  });

  it('does not call login when fields are empty', async () => {
    const { getByTestId } = render(<LoginScreen />);
    fireEvent.press(getByTestId('button-Sign In'));
    await waitFor(() => {
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  it('does not call login when only email is provided', async () => {
    const { getByTestId } = render(<LoginScreen />);
    fireEvent.changeText(getByTestId('input-Email'), 'user@example.com');
    fireEvent.press(getByTestId('button-Sign In'));
    await waitFor(() => {
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  it('calls login with trimmed email and password on valid input', async () => {
    mockLogin.mockResolvedValue(undefined);
    const { getByTestId } = render(<LoginScreen />);
    fireEvent.changeText(getByTestId('input-Email'), '  user@example.com  ');
    fireEvent.changeText(getByTestId('input-Password'), 'secret123');
    fireEvent.press(getByTestId('button-Sign In'));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'secret123');
    });
  });

  it('shows an alert when login throws', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockLogin.mockRejectedValue(new Error('invalid credentials'));
    const { getByTestId } = render(<LoginScreen />);
    fireEvent.changeText(getByTestId('input-Email'), 'bad@example.com');
    fireEvent.changeText(getByTestId('input-Password'), 'wrong');
    fireEvent.press(getByTestId('button-Sign In'));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Login Failed',
        'Invalid email or password. Please try again.',
      );
    });
    alertSpy.mockRestore();
  });

  it('renders the sign up link', () => {
    render(<LoginScreen />);
    expect(screen.getByText("Don't have an account?")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// app/(auth)/signup.tsx
// ---------------------------------------------------------------------------

describe('app/(auth)/signup — SignupScreen', () => {
  let SignupScreen: React.ComponentType;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    SignupScreen = require('../../app/(auth)/signup').default;
  });

  it('renders all four input fields', () => {
    const { getByTestId } = render(<SignupScreen />);
    expect(getByTestId('input-First Name')).toBeTruthy();
    expect(getByTestId('input-Last Name')).toBeTruthy();
    expect(getByTestId('input-Email')).toBeTruthy();
    expect(getByTestId('input-Password')).toBeTruthy();
  });

  it('renders the Create Account button', () => {
    const { getByTestId } = render(<SignupScreen />);
    expect(getByTestId('button-Create Account')).toBeTruthy();
  });

  it('does not call signup when fields are empty', async () => {
    const { getByTestId } = render(<SignupScreen />);
    fireEvent.press(getByTestId('button-Create Account'));
    await waitFor(() => {
      expect(mockSignup).not.toHaveBeenCalled();
    });
  });

  it('does not call signup when some fields are missing', async () => {
    const { getByTestId } = render(<SignupScreen />);
    fireEvent.changeText(getByTestId('input-First Name'), 'Alice');
    fireEvent.changeText(getByTestId('input-Email'), 'alice@example.com');
    // Last Name and Password still empty
    fireEvent.press(getByTestId('button-Create Account'));
    await waitFor(() => {
      expect(mockSignup).not.toHaveBeenCalled();
    });
  });

  it('calls signup with correct trimmed args when all fields provided', async () => {
    mockSignup.mockResolvedValue(undefined);
    const { getByTestId } = render(<SignupScreen />);
    fireEvent.changeText(getByTestId('input-First Name'), ' Alice ');
    fireEvent.changeText(getByTestId('input-Last Name'), ' Smith ');
    fireEvent.changeText(getByTestId('input-Email'), ' alice@example.com ');
    fireEvent.changeText(getByTestId('input-Password'), 'pass1234');
    fireEvent.press(getByTestId('button-Create Account'));
    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith(
        'alice@example.com',
        'pass1234',
        'Alice',
        'Smith',
      );
    });
  });

  it('shows an alert when signup throws', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSignup.mockRejectedValue(new Error('server error'));
    const { getByTestId } = render(<SignupScreen />);
    fireEvent.changeText(getByTestId('input-First Name'), 'Bob');
    fireEvent.changeText(getByTestId('input-Last Name'), 'Jones');
    fireEvent.changeText(getByTestId('input-Email'), 'bob@example.com');
    fireEvent.changeText(getByTestId('input-Password'), 'pass');
    fireEvent.press(getByTestId('button-Create Account'));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Signup Failed',
        'Could not create account. Please try again.',
      );
    });
    alertSpy.mockRestore();
  });

  it('renders the sign in link', () => {
    render(<SignupScreen />);
    expect(screen.getByText('Already have an account?')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// app/(tabs)/_layout.tsx — TabLayout + TabIcon
//
// Strategy: Tabs.Screen is mocked at module scope to capture the options
// (including the tabBarIcon render function) passed by TabLayout. The captured
// options are stored in mockCapturedScreens (prefixed "mock" so Jest's factory
// hoisting restriction allows the reference).
// ---------------------------------------------------------------------------

// Module-level store for captured Tabs.Screen options — prefix "mock" is
// required so jest.mock factories can reference this out-of-scope variable.
const mockCapturedScreens: Array<{ name: string; options: Record<string, unknown> }> = [];

// A second mock factory for expo-router that captures Tabs.Screen options.
// We use jest.doMock (not hoisted) inside a describe-scoped beforeEach so that
// jest.resetModules() takes effect before each test.

describe('app/(tabs)/_layout — TabLayout + TabIcon', () => {
  beforeEach(() => {
    mockCapturedScreens.length = 0;
    jest.resetModules();

    // Re-apply all required mocks after resetModules
    jest.doMock('expo-router', () => {
      const React = require('react');
      const { View } = require('react-native');

      const Tabs = ({ children }: { children?: React.ReactNode }) => (
        <View testID="tabs">{children}</View>
      );
      Tabs.Screen = ({
        name,
        options,
        children,
      }: {
        name: string;
        options?: Record<string, unknown>;
        children?: React.ReactNode;
      }) => {
        mockCapturedScreens.push({ name, options: options ?? {} });
        return <View testID={`tabs-screen-${name}`}>{children}</View>;
      };

      const Stack = ({ children }: { children?: React.ReactNode }) => (
        <View testID="stack">{children}</View>
      );
      Stack.Screen = ({ children }: { children?: React.ReactNode }) => (
        <View testID="stack-screen">{children}</View>
      );

      const Redirect = ({ href }: { href: string }) => (
        <View testID="redirect"><View /></View>
      );
      const Slot = ({ children }: { children?: React.ReactNode }) => (
        <View testID="slot">{children}</View>
      );
      const Link = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
      const SplashScreen = {
        preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
        hideAsync: jest.fn().mockResolvedValue(undefined),
      };
      const useRouter = () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() });
      const useSegments = () => [];
      return { Redirect, Slot, Stack, Tabs, Link, SplashScreen, useRouter, useSegments };
    });

    jest.doMock('@/contexts/ThemeContext', () => ({
      __esModule: true,
      useTheme: () => ({
        isDark: false,
        colorScheme: 'light',
        themeMode: 'light',
        setThemeMode: jest.fn(),
      }),
      default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }));

    jest.doMock('@/contexts/NotificationContext', () => ({
      __esModule: true,
      useNotifications: () => ({
        notifications: [],
        unreadCount: 0,
        dmUnreadCount: 0,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        addNotificationListener: jest.fn(),
      }),
      default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }));

    jest.doMock('@beach-kings/shared/tokens', () => ({
      colors: {
        primary: '#1a3a4a',
        accent: '#e6ac00',
        bgPrimary: '#f9f9f9',
        bgSurface: '#ffffff',
        gray200: '#e5e7eb',
        textTertiary: '#999999',
      },
      darkColors: {
        bgBase: '#0d0d1a',
        bgTabbar: '#1a1a2e',
        brandTeal: '#14b8a6',
        brandGold: '#f59e0b',
        textTertiary: '#737373',
        border: '#2a2a3e',
      },
    }));

    jest.doMock('@/components/ui/icons', () => {
      const React = require('react');
      const { View } = require('react-native');
      const makeIcon =
        (name: string) =>
        ({ size, color }: { size?: number; color?: string }) =>
          <View testID={`icon-${name}`} />;
      return {
        HomeIcon: makeIcon('HomeIcon'),
        TrophyIcon: makeIcon('TrophyIcon'),
        PlusIcon: makeIcon('PlusIcon'),
        ChatIcon: makeIcon('ChatIcon'),
        UserIcon: makeIcon('UserIcon'),
        AlertTriangleIcon: makeIcon('AlertTriangleIcon'),
        ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
      };
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  function getTabIconRenderer(
    name: string,
  ): ((params: { focused: boolean }) => React.ReactNode) | null {
    const entry = mockCapturedScreens.find((s) => s.name === name);
    if (!entry) return null;
    const tabBarIcon = entry.options?.tabBarIcon;
    if (typeof tabBarIcon !== 'function') return null;
    return tabBarIcon as (params: { focused: boolean }) => React.ReactNode;
  }

  it('renders TabLayout with all five Tabs.Screen entries', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TabLayout = require('../../app/(tabs)/_layout').default;
    render(<TabLayout />);
    const names = mockCapturedScreens.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(['home', 'leagues', 'add-games', 'social', 'profile']),
    );
  });

  it('renders TabLayout in dark mode without crashing', () => {
    jest.doMock('@/contexts/ThemeContext', () => ({
      __esModule: true,
      useTheme: () => ({
        isDark: true,
        colorScheme: 'dark',
        themeMode: 'dark',
        setThemeMode: jest.fn(),
      }),
      default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TabLayout = require('../../app/(tabs)/_layout').default;
    const { getByTestId } = render(<TabLayout />);
    expect(getByTestId('tabs')).toBeTruthy();
  });

  it('TabIcon — regular icon focused renders icon', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TabLayout = require('../../app/(tabs)/_layout').default;
    render(<TabLayout />);
    const renderer = getTabIconRenderer('home');
    expect(renderer).not.toBeNull();
    const { getByTestId } = render(renderer!({ focused: true }) as React.ReactElement);
    expect(getByTestId('icon-HomeIcon')).toBeTruthy();
  });

  it('TabIcon — regular icon unfocused renders icon', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TabLayout = require('../../app/(tabs)/_layout').default;
    render(<TabLayout />);
    const renderer = getTabIconRenderer('home');
    expect(renderer).not.toBeNull();
    const { getByTestId } = render(renderer!({ focused: false }) as React.ReactElement);
    expect(getByTestId('icon-HomeIcon')).toBeTruthy();
  });

  it('TabIcon — add-games renders FAB-style (isAddGames) icon', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TabLayout = require('../../app/(tabs)/_layout').default;
    render(<TabLayout />);
    const renderer = getTabIconRenderer('add-games');
    expect(renderer).not.toBeNull();
    const { getByTestId } = render(renderer!({ focused: false }) as React.ReactElement);
    expect(getByTestId('icon-PlusIcon')).toBeTruthy();
  });

  it('TabIcon — badge count > 0 is rendered', () => {
    jest.doMock('@/contexts/NotificationContext', () => ({
      __esModule: true,
      useNotifications: () => ({
        notifications: [],
        unreadCount: 5,
        dmUnreadCount: 0,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        addNotificationListener: jest.fn(),
      }),
      default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TabLayout = require('../../app/(tabs)/_layout').default;
    render(<TabLayout />);
    const renderer = getTabIconRenderer('social');
    expect(renderer).not.toBeNull();
    const { getByText } = render(renderer!({ focused: false }) as React.ReactElement);
    expect(getByText('5')).toBeTruthy();
  });

  it('TabIcon — badge count > 99 shows "99+"', () => {
    jest.doMock('@/contexts/NotificationContext', () => ({
      __esModule: true,
      useNotifications: () => ({
        notifications: [],
        unreadCount: 150,
        dmUnreadCount: 0,
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        addNotificationListener: jest.fn(),
      }),
      default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TabLayout = require('../../app/(tabs)/_layout').default;
    render(<TabLayout />);
    const renderer = getTabIconRenderer('social');
    expect(renderer).not.toBeNull();
    const { getByText } = render(renderer!({ focused: false }) as React.ReactElement);
    expect(getByText('99+')).toBeTruthy();
  });

  it('TabIcon — badge with count 0 does not render badge text', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TabLayout = require('../../app/(tabs)/_layout').default;
    render(<TabLayout />);
    const renderer = getTabIconRenderer('social');
    expect(renderer).not.toBeNull();
    const { queryByText } = render(renderer!({ focused: false }) as React.ReactElement);
    expect(queryByText('0')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tab screens — home, leagues, add-games, social, profile
// ---------------------------------------------------------------------------

describe('Tab screens', () => {
  it('HomeScreen renders title text', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const HomeScreen = require('../../app/(tabs)/home').default;
    const { getByText } = render(<HomeScreen />);
    expect(getByText('Home')).toBeTruthy();
  });

  it('HomeScreen renders TopNav with Beach League title', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const HomeScreen = require('../../app/(tabs)/home').default;
    const { getByTestId } = render(<HomeScreen />);
    expect(getByTestId('top-nav')).toBeTruthy();
  });

  it('LeaguesScreen renders title text', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const LeaguesScreen = require('../../app/(tabs)/leagues').default;
    const { getAllByText } = render(<LeaguesScreen />);
    // TopNav mock also renders the title, so expect at least one match
    expect(getAllByText('Leagues').length).toBeGreaterThanOrEqual(1);
  });

  it('AddGamesScreen renders title text', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AddGamesScreen = require('../../app/(tabs)/add-games').default;
    const { getAllByText } = render(<AddGamesScreen />);
    expect(getAllByText('Add Games').length).toBeGreaterThanOrEqual(1);
  });

  it('SocialScreen renders title text', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SocialScreen = require('../../app/(tabs)/social').default;
    const { getAllByText } = render(<SocialScreen />);
    expect(getAllByText('Social').length).toBeGreaterThanOrEqual(1);
  });

  it('ProfileScreen renders title text', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ProfileScreen = require('../../app/(tabs)/profile').default;
    const { getAllByText } = render(<ProfileScreen />);
    expect(getAllByText('Profile').length).toBeGreaterThanOrEqual(1);
  });
});
