/**
 * Tests for the Onboarding wizard screen.
 * 3-step flow: gender → skill level → location.
 * On completion, calls PUT /api/users/me/player and marks profile complete.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockSetProfileComplete = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    setProfileComplete: mockSetProfileComplete,
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

const mockPut = jest.fn();
const mockGet = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    client: {
      axiosInstance: {
        put: (...args: unknown[]) => mockPut(...args),
        get: (...args: unknown[]) => mockGet(...args),
      },
    },
  },
}));

jest.spyOn(Alert, 'alert');

import OnboardingScreen from '../../../app/(auth)/onboarding';

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock locations API
    mockGet.mockResolvedValue({
      data: [
        { id: 'socal_sd', name: 'San Diego', city: 'San Diego', state: 'CA' },
        { id: 'socal_la', name: 'Los Angeles', city: 'Los Angeles', state: 'CA' },
      ],
    });
  });

  // -----------------------------------------------------------------------
  // Step 1: Gender
  // -----------------------------------------------------------------------

  it('renders step indicator showing step 1 of 3', () => {
    const { getByText } = render(<OnboardingScreen />);
    expect(getByText(/step 1/i)).toBeTruthy();
  });

  it('renders gender selection options', () => {
    const { getByText } = render(<OnboardingScreen />);
    expect(getByText('Male')).toBeTruthy();
    expect(getByText('Female')).toBeTruthy();
  });

  it('renders "Next" button on step 1', () => {
    const { getByLabelText } = render(<OnboardingScreen />);
    expect(getByLabelText('Next')).toBeTruthy();
  });

  it('advances to step 2 after selecting gender and pressing Next', () => {
    const { getByText, getByLabelText } = render(<OnboardingScreen />);

    fireEvent.press(getByText('Male'));
    fireEvent.press(getByLabelText('Next'));

    expect(getByText(/step 2/i)).toBeTruthy();
  });

  it('does not advance without gender selection', () => {
    const { getByText, getByLabelText } = render(<OnboardingScreen />);

    fireEvent.press(getByLabelText('Next'));

    // Should still be on step 1
    expect(getByText(/step 1/i)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Step 2: Skill level
  // -----------------------------------------------------------------------

  it('renders skill level options on step 2', () => {
    const { getByText, getByLabelText } = render(<OnboardingScreen />);

    fireEvent.press(getByText('Male'));
    fireEvent.press(getByLabelText('Next'));

    expect(getByText('Beginner')).toBeTruthy();
    expect(getByText('Intermediate')).toBeTruthy();
    expect(getByText('Advanced')).toBeTruthy();
  });

  it('advances to step 3 after selecting level', () => {
    const { getByText, getByLabelText } = render(<OnboardingScreen />);

    // Step 1
    fireEvent.press(getByText('Male'));
    fireEvent.press(getByLabelText('Next'));

    // Step 2
    fireEvent.press(getByText('Intermediate'));
    fireEvent.press(getByLabelText('Next'));

    expect(getByText(/step 3/i)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Step 3: Location
  // -----------------------------------------------------------------------

  it('renders location selection on step 3', async () => {
    const { getByText, getByLabelText } = render(<OnboardingScreen />);

    // Step 1
    fireEvent.press(getByText('Male'));
    fireEvent.press(getByLabelText('Next'));

    // Step 2
    fireEvent.press(getByText('Intermediate'));
    fireEvent.press(getByLabelText('Next'));

    // Step 3
    await waitFor(() => {
      expect(getByText(/location/i)).toBeTruthy();
    });
  });

  it('renders "Complete" button on step 3', async () => {
    const { getByText, getByLabelText } = render(<OnboardingScreen />);

    fireEvent.press(getByText('Male'));
    fireEvent.press(getByLabelText('Next'));
    fireEvent.press(getByText('Intermediate'));
    fireEvent.press(getByLabelText('Next'));

    await waitFor(() => {
      expect(getByLabelText('Complete')).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Submission
  // -----------------------------------------------------------------------

  it('submits profile on Complete and calls setProfileComplete', async () => {
    mockPut.mockResolvedValueOnce({
      data: { id: 1, gender: 'male', level: 'intermediate' },
    });

    const { getByText, getByLabelText } = render(<OnboardingScreen />);

    // Step 1
    fireEvent.press(getByText('Male'));
    fireEvent.press(getByLabelText('Next'));

    // Step 2
    fireEvent.press(getByText('Intermediate'));
    fireEvent.press(getByLabelText('Next'));

    // Step 3 — select a location
    await waitFor(() => {
      expect(getByText('San Diego')).toBeTruthy();
    });
    fireEvent.press(getByText('San Diego'));
    fireEvent.press(getByLabelText('Complete'));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        '/api/users/me/player',
        expect.objectContaining({
          gender: 'male',
          level: 'intermediate',
          location_id: 'socal_sd',
        }),
      );
    });

    await waitFor(() => {
      expect(mockSetProfileComplete).toHaveBeenCalledWith(true);
    });
  });

  it('shows alert on submission failure', async () => {
    mockPut.mockRejectedValueOnce(new Error('Server error'));

    const { getByText, getByLabelText } = render(<OnboardingScreen />);

    fireEvent.press(getByText('Male'));
    fireEvent.press(getByLabelText('Next'));
    fireEvent.press(getByText('Intermediate'));
    fireEvent.press(getByLabelText('Next'));

    await waitFor(() => {
      expect(getByText('San Diego')).toBeTruthy();
    });
    fireEvent.press(getByText('San Diego'));
    fireEvent.press(getByLabelText('Complete'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        expect.any(String),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  it('renders "Back" button on step 2 that returns to step 1', () => {
    const { getByText, getByLabelText } = render(<OnboardingScreen />);

    fireEvent.press(getByText('Male'));
    fireEvent.press(getByLabelText('Next'));

    // Now on step 2
    expect(getByText(/step 2/i)).toBeTruthy();

    fireEvent.press(getByLabelText('Back'));

    expect(getByText(/step 1/i)).toBeTruthy();
  });
});
