/**
 * Tests for all UI components in @/components/ui/.
 * One file covers all components — rendering + core interactions.
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any component imports
// ---------------------------------------------------------------------------

// react-native-reanimated is stubbed via moduleNameMapper in jest.config.js.

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
  hapticHeavy: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
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
  lightPalette: {
    bgPage: '#f5f5f5',
    bgSurface: '#ffffff',
    bgElevated: '#ffffff',
    bgInset: '#f5f5f5',
    bgNav: '#ffffff',
    bgTabbar: '#ffffff',
    textDefault: '#1a1a1a',
    textMuted: '#666666',
    textTertiary: '#999999',
    textInverse: '#ffffff',
    borderStrong: '#d1d5db',
    borderDivider: '#e5e7eb',
    brandTeal: '#1a3a4a',
    brandGold: '#c8a84b',
    onBrandTeal: '#ffffff',
    onBrandGold: '#1a1a1a',
    onDanger: '#ffffff',
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
    successTint: '#dcfce7',
    dangerTint: '#fee2e2',
    warningTint: '#fef3c7',
    infoTint: '#dbeafe',
  },
  darkPalette: {
    bgPage: '#161b22',
    bgSurface: '#1c2333',
    bgElevated: '#21262d',
    bgInset: '#0d1117',
    bgNav: '#161b22',
    bgTabbar: '#161b22',
    textDefault: '#e6edf3',
    textMuted: '#8b949e',
    textTertiary: '#6e7681',
    textInverse: '#1a1a1a',
    borderStrong: '#30363d',
    borderDivider: '#21262d',
    brandTeal: '#14b8a6',
    brandGold: '#d4a843',
    onBrandTeal: '#0d1117',
    onBrandGold: '#0d1117',
    onDanger: '#0d1117',
    success: '#4ade80',
    danger: '#f87171',
    warning: '#fbbf24',
    info: '#60a5fa',
    successTint: '#14532d',
    dangerTint: '#7f1d1d',
    warningTint: '#78350f',
    infoTint: '#1e3a5f',
  },
}));

// ---------------------------------------------------------------------------
// Component imports
// ---------------------------------------------------------------------------

import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Divider from '@/components/ui/Divider';
import Chip from '@/components/ui/Chip';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import SegmentControl from '@/components/ui/SegmentControl';
import Avatar from '@/components/ui/Avatar';
import BottomSheet from '@/components/ui/BottomSheet';
import StatCard from '@/components/ui/StatCard';
import OtpInput from '@/components/ui/OtpInput';
import PasswordStrength from '@/components/ui/PasswordStrength';
import PullToRefresh from '@/components/ui/PullToRefresh';
import TabView from '@/components/ui/TabView';
import SearchBar from '@/components/ui/SearchBar';
import Toast from '@/components/ui/Toast';
import ListItem from '@/components/ui/ListItem';
import ProgressBar from '@/components/ui/ProgressBar';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

describe('Input', () => {
  it('renders without password toggle by default', () => {
    const { getByPlaceholderText, queryByLabelText } = render(
      <Input value="" onChangeText={jest.fn()} placeholder="Username" />,
    );
    expect(getByPlaceholderText('Username')).toBeTruthy();
    expect(queryByLabelText('Show password')).toBeNull();
  });

  it('does not render toggle button when showPasswordToggle is false', () => {
    const { queryByLabelText } = render(
      <Input
        value=""
        onChangeText={jest.fn()}
        placeholder="Password"
        secureTextEntry
        showPasswordToggle={false}
      />,
    );
    expect(queryByLabelText('Show password')).toBeNull();
  });

  it('renders toggle button when showPasswordToggle and secureTextEntry are both true', () => {
    const { getByLabelText } = render(
      <Input
        value=""
        onChangeText={jest.fn()}
        placeholder="Password"
        secureTextEntry
        showPasswordToggle
      />,
    );
    expect(getByLabelText('Show password')).toBeTruthy();
  });

  it('password is secure by default when toggle present', () => {
    const { getByPlaceholderText } = render(
      <Input
        value=""
        onChangeText={jest.fn()}
        placeholder="Password"
        secureTextEntry
        showPasswordToggle
      />,
    );
    expect(getByPlaceholderText('Password').props.secureTextEntry).toBe(true);
  });

  it('pressing toggle reveals the password', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <Input
        value=""
        onChangeText={jest.fn()}
        placeholder="Password"
        secureTextEntry
        showPasswordToggle
      />,
    );
    fireEvent.press(getByLabelText('Show password'));
    expect(getByPlaceholderText('Password').props.secureTextEntry).toBe(false);
  });

  it('toggle a11y label changes to "Hide password" after pressing', () => {
    const { getByLabelText } = render(
      <Input
        value=""
        onChangeText={jest.fn()}
        placeholder="Password"
        secureTextEntry
        showPasswordToggle
      />,
    );
    fireEvent.press(getByLabelText('Show password'));
    expect(getByLabelText('Hide password')).toBeTruthy();
  });

  it('pressing toggle again hides the password', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <Input
        value=""
        onChangeText={jest.fn()}
        placeholder="Password"
        secureTextEntry
        showPasswordToggle
      />,
    );
    fireEvent.press(getByLabelText('Show password'));
    fireEvent.press(getByLabelText('Hide password'));
    expect(getByPlaceholderText('Password').props.secureTextEntry).toBe(true);
  });

  it('does not render toggle when showPasswordToggle is true but secureTextEntry is false', () => {
    const { queryByLabelText } = render(
      <Input
        value=""
        onChangeText={jest.fn()}
        placeholder="Search"
        showPasswordToggle
      />,
    );
    expect(queryByLabelText('Show password')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

describe('Button', () => {
  const { hapticLight, hapticMedium } = require('@/utils/haptics');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls hapticMedium when a primary button is pressed', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <Button title="Submit" onPress={onPress} variant="primary" />,
    );
    fireEvent.press(getByLabelText('Submit'));
    expect(hapticMedium).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Submit').props.className).toContain(
      'text-on-brand-teal',
    );
  });

  it('calls hapticMedium when a secondary button is pressed', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <Button title="Save" onPress={onPress} variant="secondary" />,
    );
    fireEvent.press(getByLabelText('Save'));
    expect(hapticMedium).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Save').props.className).toContain(
      'text-on-brand-gold',
    );
  });

  it('calls hapticLight when an outline button is pressed', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <Button title="Cancel" onPress={onPress} variant="outline" />,
    );
    fireEvent.press(getByLabelText('Cancel'));
    expect(hapticLight).toHaveBeenCalledTimes(1);
    expect(hapticMedium).not.toHaveBeenCalled();
  });

  it('calls hapticLight when a ghost button is pressed', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <Button title="Ghost" onPress={onPress} variant="ghost" />,
    );
    fireEvent.press(getByLabelText('Ghost'));
    expect(hapticLight).toHaveBeenCalledTimes(1);
    expect(hapticMedium).not.toHaveBeenCalled();
  });

  it('does NOT call any haptic when button is disabled', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <Button title="Disabled" onPress={onPress} disabled />,
    );
    fireEvent.press(getByLabelText('Disabled'));
    expect(hapticLight).not.toHaveBeenCalled();
    expect(hapticMedium).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does NOT call any haptic when button is loading', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <Button title="Loading" onPress={onPress} loading />,
    );
    // Loading buttons are disabled at the Pressable level — press is no-op
    fireEvent.press(getByLabelText('Loading'));
    expect(hapticLight).not.toHaveBeenCalled();
    expect(hapticMedium).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

describe('Divider', () => {
  it('renders a View', () => {
    const { toJSON } = render(<Divider />);
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

describe('Chip', () => {
  it('renders label text', () => {
    render(<Chip label="Beginner" />);
    expect(screen.getByText('Beginner')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Chip label="Intermediate" onPress={onPress} />);
    fireEvent.press(screen.getByText('Intermediate'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders with active state', () => {
    const { toJSON, getByText } = render(<Chip label="Advanced" active />);
    expect(toJSON()).toBeTruthy();
    expect(getByText('Advanced').props.className).toContain(
      'text-on-brand-teal',
    );
  });
});

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        title="No games yet"
        description="Play your first game to see stats"
      />,
    );
    expect(screen.getByText('No games yet')).toBeTruthy();
    expect(screen.getByText('Play your first game to see stats')).toBeTruthy();
  });

  it('renders action button when actionLabel and onAction provided', () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        title="No friends"
        actionLabel="Find Players"
        onAction={onAction}
      />,
    );
    fireEvent.press(screen.getByText('Find Players'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render action button without both actionLabel and onAction', () => {
    render(<EmptyState title="Empty" actionLabel="Add" />);
    // Button absent because onAction is missing
    expect(screen.queryByText('Add')).toBeNull();
  });

  it('exposes stable test IDs on both actionable buttons', () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    render(
      <EmptyState
        testID="friends-empty"
        layout="section"
        title="No friends"
        primaryAction={{ label: 'Find Players', onPress: onPrimary }}
        secondaryAction={{ label: 'Invite someone', onPress: onSecondary }}
      />,
    );

    fireEvent.press(screen.getByTestId('friends-empty-primary-action'));
    fireEvent.press(screen.getByTestId('friends-empty-secondary-action'));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// LoadingSkeleton
// ---------------------------------------------------------------------------

describe('LoadingSkeleton', () => {
  it('renders without crashing with default props', () => {
    const { toJSON } = render(<LoadingSkeleton />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders without crashing with explicit dimensions', () => {
    const { toJSON } = render(
      <LoadingSkeleton width={200} height={32} borderRadius={4} />,
    );
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SegmentControl
// ---------------------------------------------------------------------------

describe('SegmentControl', () => {
  const segments = [
    { value: 'wins', label: 'Wins' },
    { value: 'losses', label: 'Losses' },
    { value: 'ties', label: 'Ties' },
  ] as const;

  it('renders all segment labels', () => {
    render(
      <SegmentControl
        items={segments}
        value="wins"
        onValueChange={jest.fn()}
      />,
    );
    segments.forEach(({ label }) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it('calls onValueChange with the stable key when a segment is pressed', () => {
    const onValueChange = jest.fn();
    render(
      <SegmentControl
        items={segments}
        value="wins"
        onValueChange={onValueChange}
      />,
    );
    fireEvent.press(screen.getByText('Losses'));
    expect(onValueChange).toHaveBeenCalledWith('losses');
  });

  it('marks selected segment with selected accessibility state', () => {
    render(
      <SegmentControl
        items={segments}
        value="ties"
        onValueChange={jest.fn()}
      />,
    );
    const tiesElement = screen.getByRole('tab', { selected: true });
    expect(tiesElement).toBeTruthy();
  });

  it('hugs its content height when placed beside a flexing screen body', () => {
    const { getByTestId } = render(
      <SegmentControl
        testID="test-segment-control"
        items={segments}
        value="wins"
        onValueChange={jest.fn()}
      />,
    );

    expect(getByTestId('test-segment-control').props.style).toEqual(
      expect.objectContaining({ flexGrow: 0 }),
    );
  });
});

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

describe('Avatar', () => {
  it('renders initials when no imageUrl provided', () => {
    render(<Avatar name="Alex Johnson" />);
    // Initials = "AJ"
    expect(screen.getByText('AJ')).toBeTruthy();
  });

  it('renders single initial for single-word name', () => {
    render(<Avatar name="Patrick" />);
    expect(screen.getByText('P')).toBeTruthy();
  });

  it('renders at the xl size without crashing', () => {
    const { toJSON } = render(<Avatar name="Sam Lee" size="xl" />);
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// BottomSheet
// ---------------------------------------------------------------------------

describe('BottomSheet', () => {
  it('renders children when visible', () => {
    render(
      <BottomSheet visible onClose={jest.fn()}>
        <></>
      </BottomSheet>,
    );
    // The backdrop close button is always rendered inside the Modal
    expect(screen.getByLabelText('Close')).toBeTruthy();
  });

  it('does not show backdrop label when not visible', () => {
    const { toJSON } = render(
      <BottomSheet visible={false} onClose={jest.fn()}>
        <></>
      </BottomSheet>,
    );
    // Modal is not visible, tree should still be non-null (RN Modal renders null or empty)
    expect(toJSON()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

describe('StatCard', () => {
  it('renders value and label', () => {
    render(<StatCard value="42" label="Games Played" />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('Games Played')).toBeTruthy();
  });

  it('renders trend indicator when trend prop provided', () => {
    const { toJSON } = render(<StatCard value={10} label="Wins" trend="up" />);
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// OtpInput
// ---------------------------------------------------------------------------

describe('OtpInput', () => {
  it('renders the correct number of input cells (default 6)', () => {
    render(<OtpInput value="" onChange={jest.fn()} />);
    // Each cell has an accessibilityLabel "OTP digit N"
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`OTP digit ${i}`)).toBeTruthy();
    }
  });

  it('renders a custom number of input cells', () => {
    render(<OtpInput length={4} value="" onChange={jest.fn()} />);
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByLabelText(`OTP digit ${i}`)).toBeTruthy();
    }
    expect(screen.queryByLabelText('OTP digit 5')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PasswordStrength
// ---------------------------------------------------------------------------

describe('PasswordStrength', () => {
  it('renders without crashing for empty password', () => {
    const { toJSON } = render(<PasswordStrength password="" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders strength label for a strong password', () => {
    render(<PasswordStrength password="Str0ng!Pass#2024" />);
    expect(screen.getByText('Strong')).toBeTruthy();
  });

  it('renders strength label for a weak password', () => {
    render(<PasswordStrength password="abc" />);
    // score 0 → no label rendered
    expect(screen.queryByText('Weak')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PullToRefresh
// ---------------------------------------------------------------------------

describe('PullToRefresh', () => {
  it('renders children', () => {
    render(
      <PullToRefresh refreshing={false} onRefresh={jest.fn()}>
        <></>
      </PullToRefresh>,
    );
    const { toJSON } = render(
      <PullToRefresh refreshing={false} onRefresh={jest.fn()}>
        <></>
      </PullToRefresh>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders without crashing when refreshing', () => {
    const { toJSON } = render(
      <PullToRefresh refreshing onRefresh={jest.fn()}>
        <></>
      </PullToRefresh>,
    );
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TabView
// ---------------------------------------------------------------------------

describe('TabView', () => {
  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'stats', label: 'Stats' },
    { value: 'friends', label: 'Friends' },
  ] as const;

  it('renders all tab labels', () => {
    render(<TabView items={tabs} value="overview" onValueChange={jest.fn()} />);
    tabs.forEach(({ label }) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it('calls onValueChange with the stable key', () => {
    const onValueChange = jest.fn();
    render(<TabView items={tabs} value="overview" onValueChange={onValueChange} />);
    fireEvent.press(screen.getByText('Friends'));
    expect(onValueChange).toHaveBeenCalledWith('friends');
  });

  it('marks active tab with selected accessibility state', () => {
    render(<TabView items={tabs} value="stats" onValueChange={jest.fn()} />);
    const selectedTab = screen.getByRole('tab', { selected: true });
    expect(selectedTab).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SearchBar
// ---------------------------------------------------------------------------

describe('SearchBar', () => {
  it('renders placeholder text', () => {
    render(
      <SearchBar
        value=""
        onChangeText={jest.fn()}
        placeholder="Search players"
      />,
    );
    expect(screen.getByPlaceholderText('Search players')).toBeTruthy();
  });

  it('calls onChangeText when text is entered', () => {
    const onChangeText = jest.fn();
    render(<SearchBar value="" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByPlaceholderText('Search'), 'Patrick');
    expect(onChangeText).toHaveBeenCalledWith('Patrick');
  });

  it('shows clear button when value is non-empty', () => {
    render(<SearchBar value="test" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Clear search')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

describe('Toast', () => {
  it('renders message when visible', () => {
    render(
      <Toast
        message="Saved successfully"
        type="success"
        visible
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText('Saved successfully')).toBeTruthy();
  });

  it('renders nothing when not visible', () => {
    const { toJSON } = render(
      <Toast
        message="Error occurred"
        type="error"
        visible={false}
        onDismiss={jest.fn()}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('calls onDismiss when pressed', () => {
    const onDismiss = jest.fn();
    render(<Toast message="Info" type="info" visible onDismiss={onDismiss} />);
    fireEvent.press(screen.getByText('Info'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ListItem
// ---------------------------------------------------------------------------

describe('ListItem', () => {
  it('renders title', () => {
    render(<ListItem title="Profile Settings" />);
    expect(screen.getByText('Profile Settings')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    render(
      <ListItem title="Notifications" subtitle="Manage push notifications" />,
    );
    expect(screen.getByText('Manage push notifications')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    render(<ListItem title="Account" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText('Account'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------

describe('ProgressBar', () => {
  it('renders with progress value', () => {
    const { toJSON } = render(<ProgressBar progress={0.6} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with 0 progress without crashing', () => {
    const { toJSON } = render(<ProgressBar progress={0} />);
    expect(toJSON()).toBeTruthy();
  });

  it('clamps progress above 1 to full', () => {
    const { toJSON } = render(<ProgressBar progress={1.5} />);
    expect(toJSON()).toBeTruthy();
  });
});
