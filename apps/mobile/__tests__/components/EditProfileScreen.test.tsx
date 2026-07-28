import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EditProfileScreen from '@/components/screens/Profile/EditProfileScreen';
import { api } from '@/lib/api';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useSegments: () => ['(stack)', 'edit-profile'],
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#0f766e',
    textDefault: '#111827',
    textTertiary: '#6b7280',
    textInverse: '#ffffff',
  }),
}));

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'images' },
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({
    granted: true,
  }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getCurrentUserPlayer: jest.fn(),
    getLocations: jest.fn(),
    updatePlayerProfile: jest.fn(),
    uploadAvatar: jest.fn(),
    deleteAvatar: jest.fn(),
  },
}));

const PLAYER = {
  id: 42,
  name: 'Pat Player',
  full_name: 'Pat Player',
  first_name: 'Pat',
  last_name: 'Player',
  nickname: 'P',
  gender: 'male',
  level: 'advanced',
  city: 'Brooklyn',
  state: 'NY',
  location_id: 'nyc',
  date_of_birth: '1990-04-12',
  height: '5 ft 10 in',
  preferred_side: 'left',
  profile_picture_url: null,
};

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <EditProfileScreen />
    </QueryClientProvider>,
  );
}

describe('EditProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getCurrentUserPlayer as jest.Mock).mockResolvedValue(PLAYER);
    (api.getLocations as jest.Mock).mockResolvedValue([{
      id: 'nyc',
      city: 'New York',
      state: 'NY',
      name: 'New York City',
    }]);
    (api.updatePlayerProfile as jest.Mock).mockImplementation(
      async (updates: object) => ({ ...PLAYER, ...updates }),
    );
  });

  it('loads every previously read-only profile field into editable controls', async () => {
    renderScreen();

    expect(await screen.findByDisplayValue('Pat')).toBeTruthy();
    expect(screen.getByDisplayValue('Player')).toBeTruthy();
    expect(screen.getByDisplayValue('P')).toBeTruthy();
    expect(screen.getByDisplayValue('04/12/1990')).toBeTruthy();
    expect(screen.getByDisplayValue('5 ft 10 in')).toBeTruthy();
    expect(screen.getByLabelText('Add profile photo')).toBeTruthy();
    expect(screen.getByLabelText('Save Changes')).toBeTruthy();
  });

  it('saves through the centralized mutation and returns to Profile', async () => {
    renderScreen();
    const firstName = await screen.findByTestId('edit-profile-first-name');

    fireEvent.changeText(firstName, 'Patrick');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Save Changes'));
    });

    await waitFor(() => expect(api.updatePlayerProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: 'Patrick',
        last_name: 'Player',
        full_name: 'Patrick Player',
        location_id: 'nyc',
      }),
    ));
    expect(mockBack).toHaveBeenCalled();
  });
});
