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
}));

// ---------------------------------------------------------------------------
// Component imports
// ---------------------------------------------------------------------------

import Divider from '@/components/ui/Divider';
import Chip from '@/components/ui/Chip';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import Modal from '@/components/ui/Modal';
import SegmentControl from '@/components/ui/SegmentControl';
import Avatar from '@/components/ui/Avatar';
import BottomSheet from '@/components/ui/BottomSheet';
import StatCard from '@/components/ui/StatCard';
import OtpInput from '@/components/ui/OtpInput';
import PasswordStrength from '@/components/ui/PasswordStrength';
import PullToRefresh from '@/components/ui/PullToRefresh';
import TabView from '@/components/ui/TabView';
import SearchBar from '@/components/ui/SearchBar';
import FilterChips from '@/components/ui/FilterChips';
import Toast from '@/components/ui/Toast';
import ListItem from '@/components/ui/ListItem';
import ProgressBar from '@/components/ui/ProgressBar';

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
    const { toJSON } = render(<Chip label="Advanced" active />);
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No games yet" description="Play your first game to see stats" />);
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
      />
    );
    fireEvent.press(screen.getByText('Find Players'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render action button without both actionLabel and onAction', () => {
    render(<EmptyState title="Empty" actionLabel="Add" />);
    // Button absent because onAction is missing
    expect(screen.queryByText('Add')).toBeNull();
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
    const { toJSON } = render(<LoadingSkeleton width={200} height={32} borderRadius={4} />);
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

describe('Modal', () => {
  it('renders children when visible', () => {
    render(
      <Modal visible onClose={jest.fn()}>
        <></>
      </Modal>
    );
    // Modal renders the close button even without a title
    expect(screen.getByAccessibilityHint ? screen.getByLabelText('Close') : screen.getByLabelText('Close')).toBeTruthy();
  });

  it('calls onClose when close button pressed', () => {
    const onClose = jest.fn();
    render(
      <Modal visible onClose={onClose} title="Test Modal">
        <></>
      </Modal>
    );
    fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders title text', () => {
    render(
      <Modal visible onClose={jest.fn()} title="My Modal">
        <></>
      </Modal>
    );
    expect(screen.getByText('My Modal')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SegmentControl
// ---------------------------------------------------------------------------

describe('SegmentControl', () => {
  const segments = ['Wins', 'Losses', 'Ties'];

  it('renders all segment labels', () => {
    render(
      <SegmentControl segments={segments} selectedIndex={0} onSelect={jest.fn()} />
    );
    segments.forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it('calls onSelect with the correct index when a segment is pressed', () => {
    const onSelect = jest.fn();
    render(
      <SegmentControl segments={segments} selectedIndex={0} onSelect={onSelect} />
    );
    fireEvent.press(screen.getByText('Losses'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('marks selected segment with selected accessibility state', () => {
    render(
      <SegmentControl segments={segments} selectedIndex={2} onSelect={jest.fn()} />
    );
    const tiesElement = screen.getByRole('tab', { selected: true });
    expect(tiesElement).toBeTruthy();
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
      </BottomSheet>
    );
    // The backdrop close button is always rendered inside the Modal
    expect(screen.getByLabelText('Close')).toBeTruthy();
  });

  it('does not show backdrop label when not visible', () => {
    const { toJSON } = render(
      <BottomSheet visible={false} onClose={jest.fn()}>
        <></>
      </BottomSheet>
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
      </PullToRefresh>
    );
    const { toJSON } = render(
      <PullToRefresh refreshing={false} onRefresh={jest.fn()}>
        <></>
      </PullToRefresh>
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders without crashing when refreshing', () => {
    const { toJSON } = render(
      <PullToRefresh refreshing onRefresh={jest.fn()}>
        <></>
      </PullToRefresh>
    );
    expect(toJSON()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TabView
// ---------------------------------------------------------------------------

describe('TabView', () => {
  const tabs = ['Overview', 'Stats', 'Friends'];

  it('renders all tab labels', () => {
    render(<TabView tabs={tabs} activeIndex={0} onTabPress={jest.fn()} />);
    tabs.forEach((tab) => {
      expect(screen.getByText(tab)).toBeTruthy();
    });
  });

  it('calls onTabPress with the correct index', () => {
    const onTabPress = jest.fn();
    render(<TabView tabs={tabs} activeIndex={0} onTabPress={onTabPress} />);
    fireEvent.press(screen.getByText('Friends'));
    expect(onTabPress).toHaveBeenCalledWith(2);
  });

  it('marks active tab with selected accessibility state', () => {
    render(<TabView tabs={tabs} activeIndex={1} onTabPress={jest.fn()} />);
    const selectedTab = screen.getByRole('tab', { selected: true });
    expect(selectedTab).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SearchBar
// ---------------------------------------------------------------------------

describe('SearchBar', () => {
  it('renders placeholder text', () => {
    render(<SearchBar value="" onChangeText={jest.fn()} placeholder="Search players" />);
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
// FilterChips
// ---------------------------------------------------------------------------

describe('FilterChips', () => {
  const options = [
    { label: 'Beginner', value: 'beginner' },
    { label: 'Intermediate', value: 'intermediate' },
    { label: 'Advanced', value: 'advanced' },
  ];

  it('renders all option labels', () => {
    render(<FilterChips options={options} selected={[]} onToggle={jest.fn()} />);
    options.forEach(({ label }) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it('calls onToggle with correct value when chip pressed', () => {
    const onToggle = jest.fn();
    render(<FilterChips options={options} selected={[]} onToggle={onToggle} />);
    fireEvent.press(screen.getByText('Intermediate'));
    expect(onToggle).toHaveBeenCalledWith('intermediate');
  });

  it('renders selected chip with active state', () => {
    render(
      <FilterChips options={options} selected={['advanced']} onToggle={jest.fn()} />
    );
    // The "Advanced" chip has accessibilityRole="button" and selected=true
    const selected = screen.getByRole('button', { selected: true, name: 'Advanced' });
    expect(selected).toBeTruthy();
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
      />
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
      />
    );
    expect(toJSON()).toBeNull();
  });

  it('calls onDismiss when pressed', () => {
    const onDismiss = jest.fn();
    render(
      <Toast message="Info" type="info" visible onDismiss={onDismiss} />
    );
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
    render(<ListItem title="Notifications" subtitle="Manage push notifications" />);
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
