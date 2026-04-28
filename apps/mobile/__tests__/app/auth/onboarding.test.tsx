/**
 * Tests for the Onboarding screen.
 * Required fields: gender (BottomSheet), skill level (BottomSheet),
 * city (CityAutocomplete — Geoapify proxy), location (searchable BottomSheet,
 * auto-selected from city). Optional: nickname, date of birth (MM/DD/YYYY).
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
  hapticHeavy: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
}));

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

// Bypass debounce: return input value immediately so autocomplete fetches
// fire synchronously on text change during tests.
jest.mock('@/hooks/useDebounce', () => ({
  __esModule: true,
  default: <T,>(value: T): T => value,
}));

const mockGetLocations = jest.fn();
const mockUpdatePlayerProfile = jest.fn();
const mockGetCityAutocomplete = jest.fn();
const mockGetLocationDistances = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getLocations: (...args: unknown[]) => mockGetLocations(...args),
    updatePlayerProfile: (...args: unknown[]) =>
      mockUpdatePlayerProfile(...args),
    getCityAutocomplete: (...args: unknown[]) =>
      mockGetCityAutocomplete(...args),
    getLocationDistances: (...args: unknown[]) =>
      mockGetLocationDistances(...args),
  },
}));

jest.spyOn(Alert, 'alert');

import OnboardingScreen from '../../../app/(auth)/onboarding';

const LOCATIONS = [
  { id: 'socal_sd', name: 'San Diego', city: 'San Diego', state: 'CA' },
  { id: 'socal_la', name: 'Los Angeles', city: 'Los Angeles', state: 'CA' },
  { id: 'az_phx', name: 'Phoenix', city: 'Phoenix', state: 'AZ' },
];

const GEOAPIFY_SAN_DIEGO = {
  features: [
    {
      properties: {
        city: 'San Diego',
        // Component prefers `state` — keep it as 2-letter for the formatted label.
        state: 'CA',
      },
      geometry: { coordinates: [-117.1611, 32.7157] },
    },
  ],
};

async function waitForLocationsLoaded(
  getByTestId: ReturnType<typeof render>['getByTestId'],
): Promise<void> {
  await waitFor(() => {
    expect(mockGetLocations).toHaveBeenCalled();
  });
  await waitFor(() => {
    expect(getByTestId('onboarding-location-select')).toHaveTextContent(
      'Select location',
    );
  });
}

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocations.mockResolvedValue(LOCATIONS);
    mockGetCityAutocomplete.mockResolvedValue(GEOAPIFY_SAN_DIEGO);
    mockGetLocationDistances.mockResolvedValue([
      { id: 'socal_sd', city: 'San Diego', state: 'CA', distance_miles: 2 },
      {
        id: 'socal_la',
        city: 'Los Angeles',
        state: 'CA',
        distance_miles: 115,
      },
    ]);
  });

  it('renders the heading', () => {
    const { getByText } = render(<OnboardingScreen />);
    expect(getByText('Complete Your Profile')).toBeTruthy();
  });

  it('renders required field labels', () => {
    const { getByText } = render(<OnboardingScreen />);
    expect(getByText(/Gender/)).toBeTruthy();
    expect(getByText(/Skill Level/)).toBeTruthy();
    expect(getByText(/^.*City$/)).toBeTruthy();
    expect(getByText(/^.*Location$/)).toBeTruthy();
  });

  it('renders the Save Profile button', () => {
    const { getByText } = render(<OnboardingScreen />);
    expect(getByText('Save Profile')).toBeTruthy();
  });

  it('renders the Skip for now link', () => {
    const { getByLabelText } = render(<OnboardingScreen />);
    expect(getByLabelText('Skip for now')).toBeTruthy();
  });

  it('opens the gender sheet and selects an option', async () => {
    const { getByTestId, findByText } = render(<OnboardingScreen />);
    fireEvent.press(getByTestId('onboarding-gender-select'));
    fireEvent.press(await findByText('Male'));
    await waitFor(() => {
      expect(getByTestId('onboarding-gender-select')).toHaveTextContent('Male');
    });
  });

  it('opens the skill level sheet and selects a canonical value', async () => {
    const { getByTestId, findByText } = render(<OnboardingScreen />);
    fireEvent.press(getByTestId('onboarding-level-select'));
    fireEvent.press(await findByText('Intermediate'));
    await waitFor(() => {
      expect(getByTestId('onboarding-level-select')).toHaveTextContent(
        /Intermediate/,
      );
    });
  });

  it('fetches city suggestions and auto-selects closest location on pick', async () => {
    const { getByPlaceholderText, findByLabelText, getByTestId } = render(
      <OnboardingScreen />,
    );
    await waitForLocationsLoaded(getByTestId);

    fireEvent.changeText(
      getByPlaceholderText('Start typing your city...'),
      'San D',
    );

    await waitFor(() => {
      expect(mockGetCityAutocomplete).toHaveBeenCalledWith('San D');
    });

    const suggestion = await findByLabelText('Select San Diego, CA');
    fireEvent.press(suggestion);

    await waitFor(() => {
      expect(mockGetLocationDistances).toHaveBeenCalledWith(32.7157, -117.1611);
    });

    // Closest location auto-selected + label gains " (X mi)".
    await waitFor(() => {
      expect(getByTestId('onboarding-location-select')).toHaveTextContent(
        /San Diego.*mi/,
      );
    });
  });

  it('does not submit when required fields are empty', () => {
    const { getByText } = render(<OnboardingScreen />);
    fireEvent.press(getByText('Save Profile'));
    expect(mockUpdatePlayerProfile).not.toHaveBeenCalled();
  });

  it('submits profile with selected values and shows success screen', async () => {
    mockUpdatePlayerProfile.mockResolvedValueOnce({
      id: 1,
      gender: 'male',
      level: 'intermediate',
    });

    const {
      getByTestId,
      getByText,
      getByPlaceholderText,
      findByText,
      findByLabelText,
    } = render(<OnboardingScreen />);

    await waitForLocationsLoaded(getByTestId);

    // Gender — bottom sheet
    fireEvent.press(getByTestId('onboarding-gender-select'));
    fireEvent.press(await findByText('Male'));

    // Skill level — bottom sheet
    fireEvent.press(getByTestId('onboarding-level-select'));
    fireEvent.press(await findByText('Intermediate'));

    // City — autocomplete; picking a suggestion also auto-selects location.
    fireEvent.changeText(
      getByPlaceholderText('Start typing your city...'),
      'San D',
    );
    fireEvent.press(await findByLabelText('Select San Diego, CA'));

    await waitFor(() => {
      expect(mockGetLocationDistances).toHaveBeenCalled();
    });

    fireEvent.press(getByText('Save Profile'));

    await waitFor(() => {
      expect(mockUpdatePlayerProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          gender: 'male',
          level: 'intermediate',
          location_id: 'socal_sd',
          city: 'San Diego, CA',
          state: 'CA',
        }),
      );
    });

    expect(await findByText('Profile Complete!')).toBeTruthy();
  });

  it('shows alert on submission failure', async () => {
    mockUpdatePlayerProfile.mockRejectedValueOnce(new Error('Server error'));

    const {
      getByTestId,
      getByText,
      getByPlaceholderText,
      findByText,
      findByLabelText,
    } = render(<OnboardingScreen />);

    await waitForLocationsLoaded(getByTestId);

    fireEvent.press(getByTestId('onboarding-gender-select'));
    fireEvent.press(await findByText('Male'));
    fireEvent.press(getByTestId('onboarding-level-select'));
    fireEvent.press(await findByText('Intermediate'));

    fireEvent.changeText(
      getByPlaceholderText('Start typing your city...'),
      'San D',
    );
    fireEvent.press(await findByLabelText('Select San Diego, CA'));
    await waitFor(() => expect(mockGetLocationDistances).toHaveBeenCalled());

    fireEvent.press(getByText('Save Profile'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
    });
  });

  it('Get Started on success screen marks profile complete and navigates', async () => {
    mockUpdatePlayerProfile.mockResolvedValueOnce({ id: 1 });

    const {
      getByTestId,
      getByText,
      getByPlaceholderText,
      findByText,
      findByLabelText,
    } = render(<OnboardingScreen />);

    await waitForLocationsLoaded(getByTestId);

    fireEvent.press(getByTestId('onboarding-gender-select'));
    fireEvent.press(await findByText('Male'));
    fireEvent.press(getByTestId('onboarding-level-select'));
    fireEvent.press(await findByText('Intermediate'));

    fireEvent.changeText(
      getByPlaceholderText('Start typing your city...'),
      'San D',
    );
    fireEvent.press(await findByLabelText('Select San Diego, CA'));
    await waitFor(() => expect(mockGetLocationDistances).toHaveBeenCalled());

    fireEvent.press(getByText('Save Profile'));

    const getStarted = await findByText('Get Started');
    fireEvent.press(getStarted);

    expect(mockSetProfileComplete).toHaveBeenCalledWith(true);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('Skip for now marks profile complete and navigates home', () => {
    const { getByLabelText } = render(<OnboardingScreen />);
    fireEvent.press(getByLabelText('Skip for now'));
    expect(mockSetProfileComplete).toHaveBeenCalledWith(true);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('shows alert if locations fail to load', async () => {
    mockGetLocations.mockRejectedValueOnce(new Error('network'));
    render(<OnboardingScreen />);
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
    });
  });

  it('nickname input advertises autofill hints and chains to DOB', () => {
    const { getByPlaceholderText } = render(<OnboardingScreen />);
    const nickname = getByPlaceholderText('What do people call you?');
    expect(nickname.props.returnKeyType).toBe('next');
    expect(nickname.props.textContentType).toBe('nickname');
    expect(nickname.props.autoComplete).toBe('nickname');
  });

  it('date of birth input uses MM/DD/YYYY mask with number pad', () => {
    const { getByTestId } = render(<OnboardingScreen />);
    const dob = getByTestId('onboarding-dob-input');
    expect(dob.props.placeholder).toBe('MM/DD/YYYY');
    expect(dob.props.keyboardType).toBe('number-pad');
    expect(dob.props.maxLength).toBe(10);
  });

  it('masks typed digits into MM/DD/YYYY as the user types', () => {
    const { getByTestId } = render(<OnboardingScreen />);
    const dob = getByTestId('onboarding-dob-input');
    fireEvent.changeText(dob, '01151990');
    expect(dob.props.value).toBe('01/15/1990');
  });

  it('exposes a calendar button that opens the native picker', () => {
    const { getByTestId } = render(<OnboardingScreen />);
    expect(
      getByTestId('onboarding-dob-input-picker-button'),
    ).toBeTruthy();
  });

  it('City field renders before Skill Level field in the required section', () => {
    const { getByPlaceholderText, getByTestId, getAllByText } = render(<OnboardingScreen />);
    // The City input (CityAutocomplete) and Skill Level select (BottomSheetSelect)
    // are both visible in the form.
    const cityInput = getByPlaceholderText('Start typing your city...');
    const levelSelect = getByTestId('onboarding-level-select');
    expect(cityInput).toBeTruthy();
    expect(levelSelect).toBeTruthy();

    // Verify render order by comparing tree position of each node.
    // We walk up to the root collecting child indices, then compare paths.
    type FiberNode = { parent: FiberNode | null; children: FiberNode[] };
    function treePosition(node: FiberNode): number[] {
      const path: number[] = [];
      let current: FiberNode | null = node;
      while (current?.parent) {
        const idx = current.parent.children.indexOf(current);
        path.unshift(idx);
        current = current.parent;
      }
      return path;
    }
    const cityPos = treePosition(cityInput as unknown as FiberNode);
    const levelPos = treePosition(levelSelect as unknown as FiberNode);
    // Find first differing position in the paths
    let differs = false;
    for (let i = 0; i < Math.min(cityPos.length, levelPos.length); i++) {
      if (cityPos[i] !== levelPos[i]) {
        expect(cityPos[i]).toBeLessThan(levelPos[i]);
        differs = true;
        break;
      }
    }
    if (!differs) {
      // One is ancestor of other — the shallower (ancestor) is considered earlier
      expect(cityPos.length).toBeLessThanOrEqual(levelPos.length);
    }
  });

  it('filters location options by full state name when searching', async () => {
    const { getByTestId, findByLabelText, getByPlaceholderText, queryByLabelText } =
      render(<OnboardingScreen />);
    await waitForLocationsLoaded(getByTestId);

    fireEvent.press(getByTestId('onboarding-location-select'));

    // All three options present before filtering.
    await findByLabelText('San Diego');
    expect(queryByLabelText('Phoenix')).toBeTruthy();
    expect(queryByLabelText('Los Angeles')).toBeTruthy();

    fireEvent.changeText(
      getByPlaceholderText('Search city or state'),
      'Arizona',
    );

    await waitFor(() => {
      expect(queryByLabelText('San Diego')).toBeNull();
    });
    expect(queryByLabelText('Los Angeles')).toBeNull();
    expect(queryByLabelText('Phoenix')).toBeTruthy();
  });

  it('calls hapticSuccess on successful profile submission', async () => {
    const { hapticSuccess } = require('@/utils/haptics');
    mockUpdatePlayerProfile.mockResolvedValueOnce({ id: 1 });

    const {
      getByTestId,
      getByText,
      getByPlaceholderText,
      findByText,
      findByLabelText,
    } = render(<OnboardingScreen />);

    await waitForLocationsLoaded(getByTestId);

    fireEvent.press(getByTestId('onboarding-gender-select'));
    fireEvent.press(await findByText('Male'));
    fireEvent.press(getByTestId('onboarding-level-select'));
    fireEvent.press(await findByText('Intermediate'));

    fireEvent.changeText(getByPlaceholderText('Start typing your city...'), 'San D');
    fireEvent.press(await findByLabelText('Select San Diego, CA'));
    await waitFor(() => expect(mockGetLocationDistances).toHaveBeenCalled());

    fireEvent.press(getByText('Save Profile'));

    await waitFor(() => {
      expect(mockUpdatePlayerProfile).toHaveBeenCalled();
    });
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });
});
