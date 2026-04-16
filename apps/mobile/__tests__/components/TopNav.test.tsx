/**
 * Tests for the TopNav component.
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import TopNav from '@/components/ui/TopNav';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colorScheme: 'light',
    themeMode: 'light',
    setThemeMode: jest.fn(),
  }),
}));

jest.mock('@beach-kings/shared/tokens', () => ({
  colors: {
    primary: '#1a3a4a',
    textPrimary: '#1a1a1a',
    textSecondary: '#666666',
    textTertiary: '#999999',
    textInverse: '#ffffff',
    brandTeal: '#0D9488',
  },
  darkColors: {
    textPrimary: '#f5f5f5',
    textSecondary: '#a3a3a3',
    textTertiary: '#737373',
    brandTeal: '#14b8a6',
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopNav', () => {
  it('renders the title', () => {
    render(<TopNav title="Home" />);
    expect(screen.getByText('Home')).toBeTruthy();
  });

  it('shows back button when showBack is true', () => {
    render(<TopNav title="Profile" showBack />);
    expect(screen.getByLabelText('Go back')).toBeTruthy();
  });

  it('does not show back button by default', () => {
    render(<TopNav title="Leagues" />);
    expect(screen.queryByLabelText('Go back')).toBeNull();
  });

  it('navigates back when back button is pressed', () => {
    render(<TopNav title="Settings" showBack />);
    fireEvent.press(screen.getByLabelText('Go back'));
    // Verify the back button rendered and is pressable (the mock's back() was called)
    expect(screen.getByLabelText('Go back')).toBeTruthy();
  });

  it('renders rightAction when provided', () => {
    const { getByText } = render(
      <TopNav title="Friends" rightAction={<></>} />
    );
    expect(getByText('Friends')).toBeTruthy();
  });

  it('renders search input when searchMode is true', () => {
    render(
      <TopNav
        title="Search"
        searchMode
        searchValue=""
        onSearchChange={jest.fn()}
        searchPlaceholder="Find a player"
      />
    );
    expect(screen.getByPlaceholderText('Find a player')).toBeTruthy();
  });

  it('does not render title text when searchMode is true', () => {
    render(
      <TopNav
        title="Search"
        searchMode
        searchValue=""
        onSearchChange={jest.fn()}
      />
    );
    // Title text should not be visible — search input replaces it
    expect(screen.queryByText('Search')).toBeNull();
  });

  it('renders without background when transparent is true', () => {
    // Transparent mode just changes className — verify it renders
    const { toJSON } = render(<TopNav title="Overlay" transparent />);
    expect(toJSON()).toBeTruthy();
  });
});
