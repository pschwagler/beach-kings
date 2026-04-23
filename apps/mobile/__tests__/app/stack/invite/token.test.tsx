/**
 * Tests for the Invite Claim screen.
 * Flow: load invite details → show inviter info → claim (if authed) or prompt signup.
 *
 * These tests cover behavior visible to the user, not internal state transitions.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ token: 'abc123' }),
}));

const mockIsAuthenticated = { value: true };
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated.value,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

const mockGetInviteDetails = jest.fn();
const mockClaimInvite = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getInviteDetails: (...args: unknown[]) => mockGetInviteDetails(...args),
    claimInvite: (...args: unknown[]) => mockClaimInvite(...args),
  },
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

jest.spyOn(Alert, 'alert');

import InviteClaimScreen from '../../../../app/(stack)/invite/[token]';
import { hapticSuccess } from '@/utils/haptics';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const baseInvite = {
  inviter_name: 'Jane Doe',
  placeholder_name: 'Player 7',
  match_count: 3,
  league_names: ['Summer League 2025'],
  status: 'pending',
};

describe('InviteClaimScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated.value = true;
    mockGetInviteDetails.mockResolvedValue(baseInvite);
  });

  // ── Loading state ─────────────────────────────────────────────────────────

  it('renders loading state initially', () => {
    const { getByTestId } = render(<InviteClaimScreen />);
    expect(getByTestId('invite-loading')).toBeTruthy();
  });

  it('fetches invite details on mount', async () => {
    render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(mockGetInviteDetails).toHaveBeenCalledWith('abc123');
    });
  });

  // ── Loaded state — content ────────────────────────────────────────────────

  it('renders inviter name after loading', async () => {
    const { getByText } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(getByText(/Jane Doe/)).toBeTruthy();
    });
  });

  it('renders match count in summary', async () => {
    const { getByText } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(getByText(/3 unclaimed games/i)).toBeTruthy();
    });
  });

  it('renders one match card per match in the response', async () => {
    mockGetInviteDetails.mockResolvedValue({ ...baseInvite, match_count: 4 });
    const { getByTestId } = render(<InviteClaimScreen />);
    await waitFor(() => {
      // All 4 placeholder cards should be present by testID
      for (let i = 0; i < 4; i++) {
        expect(getByTestId(`invite-match-card-${i}`)).toBeTruthy();
      }
    });
  });

  it('renders zero match cards when match_count is 0', async () => {
    mockGetInviteDetails.mockResolvedValue({ ...baseInvite, match_count: 0 });
    const { queryByTestId } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(queryByTestId('invite-match-card-0')).toBeNull();
    });
  });

  it('renders league names', async () => {
    const { getByText } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(getByText(/Summer League 2025/)).toBeTruthy();
    });
  });

  // ── Inherited rating callout ───────────────────────────────────────────────

  it('renders inherited-rating callout when field is present', async () => {
    mockGetInviteDetails.mockResolvedValue({ ...baseInvite, inherited_rating: 1380 });
    const { getByTestId } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(getByTestId('invite-inherited-rating')).toBeTruthy();
    });
  });

  it('does NOT render inherited-rating callout when field is absent', async () => {
    // baseInvite has no inherited_rating
    const { queryByTestId } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(queryByTestId('invite-inherited-rating')).toBeNull();
    });
  });

  // ── Claim button ──────────────────────────────────────────────────────────

  it('renders "Claim My Games" button when authenticated', async () => {
    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(getByLabelText('Claim My Games')).toBeTruthy();
    });
  });

  it('calls claimInvite API on button press', async () => {
    mockClaimInvite.mockResolvedValueOnce({ success: true, message: 'Claimed!', player_id: 42 });
    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => expect(getByLabelText('Claim My Games')).toBeTruthy());
    fireEvent.press(getByLabelText('Claim My Games'));
    await waitFor(() => {
      expect(mockClaimInvite).toHaveBeenCalledWith('abc123');
    });
  });

  it('shows success alert after claiming', async () => {
    mockClaimInvite.mockResolvedValueOnce({ success: true, message: 'Claimed!', player_id: 42 });
    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => expect(getByLabelText('Claim My Games')).toBeTruthy());
    fireEvent.press(getByLabelText('Claim My Games'));
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Success', expect.any(String));
    });
  });

  it('renders success state after successful claim', async () => {
    mockClaimInvite.mockResolvedValueOnce({ success: true, message: 'Claimed!', player_id: 42 });
    const { getByLabelText, getByTestId } = render(<InviteClaimScreen />);
    await waitFor(() => expect(getByLabelText('Claim My Games')).toBeTruthy());
    fireEvent.press(getByLabelText('Claim My Games'));
    await waitFor(() => {
      expect(getByTestId('invite-success')).toBeTruthy();
    });
  });

  it('fires hapticSuccess when transitioning to success state', async () => {
    mockClaimInvite.mockResolvedValueOnce({ success: true, message: 'Claimed!', player_id: 42 });
    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => expect(getByLabelText('Claim My Games')).toBeTruthy());
    fireEvent.press(getByLabelText('Claim My Games'));
    await waitFor(() => {
      expect(hapticSuccess).toHaveBeenCalled();
    });
  });

  // ── Success state ─────────────────────────────────────────────────────────

  it('success state has "Go to Dashboard" button that navigates home', async () => {
    mockClaimInvite.mockResolvedValueOnce({ success: true, message: 'Claimed!', player_id: 42 });
    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => expect(getByLabelText('Claim My Games')).toBeTruthy());
    fireEvent.press(getByLabelText('Claim My Games'));
    await waitFor(() => expect(getByLabelText('Go to Dashboard')).toBeTruthy());
    fireEvent.press(getByLabelText('Go to Dashboard'));
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  });

  // ── "Not me" skip CTA ─────────────────────────────────────────────────────

  it('renders "Not me — skip" pressable in loaded state', async () => {
    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(getByLabelText('Not me, skip this invite')).toBeTruthy();
    });
  });

  it('shows a confirmation Alert when "Not me" is pressed', async () => {
    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => expect(getByLabelText('Not me, skip this invite')).toBeTruthy());
    fireEvent.press(getByLabelText('Not me, skip this invite'));
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Are you sure?',
        'This invite will be dismissed.',
        expect.any(Array),
      );
    });
  });

  it('navigates back when skip is confirmed', async () => {
    // Simulate pressing the "Skip" button inside the Alert
    (Alert.alert as jest.Mock).mockImplementation((_title, _msg, buttons) => {
      const skipBtn = (buttons as { text: string; onPress?: () => void }[]).find(
        (b) => b.text === 'Skip',
      );
      skipBtn?.onPress?.();
    });

    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => expect(getByLabelText('Not me, skip this invite')).toBeTruthy());
    fireEvent.press(getByLabelText('Not me, skip this invite'));

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  // ── Unauthenticated ───────────────────────────────────────────────────────

  it('renders "Sign Up to Claim" when not authenticated', async () => {
    mockIsAuthenticated.value = false;
    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(getByLabelText('Sign Up to Claim')).toBeTruthy();
    });
  });

  it('navigates to signup when not authenticated and presses button', async () => {
    mockIsAuthenticated.value = false;
    const { getByLabelText } = render(<InviteClaimScreen />);
    await waitFor(() => expect(getByLabelText('Sign Up to Claim')).toBeTruthy());
    fireEvent.press(getByLabelText('Sign Up to Claim'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/signup');
  });

  // ── Error states ──────────────────────────────────────────────────────────

  it('shows error when invite not found (404)', async () => {
    mockGetInviteDetails.mockRejectedValueOnce({
      response: { status: 404, data: { detail: 'Invite not found' } },
    });
    const { getByText } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(getByText('Invite not found')).toBeTruthy();
    });
  });

  it('shows already claimed message when status is claimed', async () => {
    mockGetInviteDetails.mockResolvedValueOnce({
      ...baseInvite,
      status: 'claimed',
    });
    const { getByText } = render(<InviteClaimScreen />);
    await waitFor(() => {
      expect(getByText(/already.*claimed/i)).toBeTruthy();
    });
  });
});
