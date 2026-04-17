/**
 * Tests for the Invite Claim screen.
 * Flow: load invite details → show inviter info → claim (if authed) or prompt signup.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
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

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    client: {
      axiosInstance: {
        get: (...args: unknown[]) => mockGet(...args),
        post: (...args: unknown[]) => mockPost(...args),
      },
    },
  },
}));

jest.spyOn(Alert, 'alert');

import InviteClaimScreen from '../../../../app/(stack)/invite/[token]';

describe('InviteClaimScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated.value = true;

    mockGet.mockResolvedValue({
      data: {
        inviter_name: 'Jane Doe',
        placeholder_name: 'Player 7',
        match_count: 5,
        league_names: ['Summer League 2025'],
        status: 'pending',
      },
    });
  });

  it('renders loading state initially', () => {
    const { getByTestId } = render(<InviteClaimScreen />);
    expect(getByTestId('invite-loading')).toBeTruthy();
  });

  it('fetches invite details on mount', async () => {
    render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/invites/abc123');
    });
  });

  it('renders inviter name after loading', async () => {
    const { getByText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByText(/Jane Doe/)).toBeTruthy();
    });
  });

  it('renders match count', async () => {
    const { getByText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByText(/5 matches/i)).toBeTruthy();
    });
  });

  it('renders league names', async () => {
    const { getByText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByText('Summer League 2025')).toBeTruthy();
    });
  });

  it('renders "Claim Invite" button when authenticated', async () => {
    const { getByLabelText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByLabelText('Claim Invite')).toBeTruthy();
    });
  });

  it('claims invite on button press', async () => {
    mockPost.mockResolvedValueOnce({
      data: { success: true, message: 'Claimed!', player_id: 42 },
    });

    const { getByLabelText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByLabelText('Claim Invite')).toBeTruthy();
    });

    fireEvent.press(getByLabelText('Claim Invite'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/invites/abc123/claim');
    });
  });

  it('shows success alert after claiming', async () => {
    mockPost.mockResolvedValueOnce({
      data: { success: true, message: 'Claimed!', player_id: 42 },
    });

    const { getByLabelText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByLabelText('Claim Invite')).toBeTruthy();
    });

    fireEvent.press(getByLabelText('Claim Invite'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Success',
        expect.any(String),
      );
    });
  });

  it('shows "Sign Up to Claim" when not authenticated', async () => {
    mockIsAuthenticated.value = false;

    const { getByLabelText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByLabelText('Sign Up to Claim')).toBeTruthy();
    });
  });

  it('navigates to signup when not authenticated and presses button', async () => {
    mockIsAuthenticated.value = false;

    const { getByLabelText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByLabelText('Sign Up to Claim')).toBeTruthy();
    });

    fireEvent.press(getByLabelText('Sign Up to Claim'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/signup');
  });

  it('shows error when invite not found', async () => {
    mockGet.mockRejectedValueOnce({
      response: { status: 404, data: { detail: 'Invite not found' } },
    });

    const { getByText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByText('Invite not found')).toBeTruthy();
    });
  });

  it('shows already claimed message when status is claimed', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        inviter_name: 'Jane Doe',
        placeholder_name: 'Player 7',
        match_count: 5,
        league_names: ['Summer League 2025'],
        status: 'claimed',
      },
    });

    const { getByText } = render(<InviteClaimScreen />);

    await waitFor(() => {
      expect(getByText(/already.*claimed/i)).toBeTruthy();
    });
  });
});
