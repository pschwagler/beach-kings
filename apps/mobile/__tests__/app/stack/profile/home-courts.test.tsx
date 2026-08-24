import React from 'react';
import { fireEvent, render as testingRender, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useSegments: () => ['(stack)', 'profile', 'home-courts'],
  useLocalSearchParams: () => ({}),
}));

const mockGetCurrentUserPlayer = jest.fn();
const mockGetPlayerHomeCourts = jest.fn();
const mockGetCourts = jest.fn();
const mockSetPlayerHomeCourts = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    getPlayerHomeCourts: (...args: unknown[]) => mockGetPlayerHomeCourts(...args),
    getCourts: (...args: unknown[]) => mockGetCourts(...args),
    setPlayerHomeCourts: (...args: unknown[]) => mockSetPlayerHomeCourts(...args),
  },
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#178080',
    textTertiary: '#777',
    textInverse: '#fff',
  }),
}));

jest.mock('@/utils/haptics', () => ({ hapticSuccess: jest.fn() }));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

import HomeCourtsScreen from '../../../../app/(stack)/profile/home-courts';
import { playerKeys } from '@/features/player';

const HOME_COURTS = [
  { id: 10, name: 'First Beach', address: 'Secret one', latitude: 1, longitude: 2, position: 0 },
  { id: 20, name: 'Second Beach', address: 'Secret two', latitude: 3, longitude: 4, position: 1 },
];
const CATALOG = [
  { id: 10, name: 'First Beach', address: 'Catalog secret one', latitude: 1, longitude: 2 },
  { id: 20, name: 'Second Beach', address: 'Catalog secret two', latitude: 3, longitude: 4 },
  { id: 30, name: 'Third Beach', address: 'Catalog secret three', latitude: 5, longitude: 6 },
];

let queryClient: QueryClient;

function renderScreen() {
  return testingRender(
    <QueryClientProvider client={queryClient}>
      <HomeCourtsScreen />
    </QueryClientProvider>,
  );
}

describe('HomeCourtsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mockGetCurrentUserPlayer.mockResolvedValue({ id: 99, name: 'Owner' });
    mockGetPlayerHomeCourts.mockResolvedValue(HOME_COURTS);
    mockGetCourts.mockResolvedValue(CATALOG);
    mockSetPlayerHomeCourts.mockImplementation(async (_playerId, courtIds: number[]) =>
      courtIds.map((id, position) => ({
        id,
        name: CATALOG.find((court) => court.id === id)?.name,
        position,
      })),
    );
  });

  it('renders only ordered court names and keeps owner data user-scoped', async () => {
    const view = renderScreen();

    expect(await view.findByText('First Beach')).toBeTruthy();
    expect(await view.findByText('Second Beach')).toBeTruthy();
    expect(view.queryByText(/Secret|Catalog secret/)).toBeNull();
    expect(queryClient.getQueryData(playerKeys.homeCourts(7, 99))).toEqual(HOME_COURTS);
    expect(queryClient.getQueryData(playerKeys.homeCourts(8, 99))).toBeUndefined();
  });

  it('adds, removes, reorders, and saves the ordered ids', async () => {
    const view = renderScreen();
    await view.findByText('First Beach');

    fireEvent.press(view.getByLabelText('Move Second Beach up'));
    fireEvent.press(view.getByLabelText('Remove First Beach'));
    fireEvent.press(view.getByLabelText('Add home court'));
    fireEvent.press(await view.findByTestId('home-court-picker-option-30'));
    fireEvent.press(view.getByLabelText('Save home courts'));

    await waitFor(() => {
      expect(mockSetPlayerHomeCourts).toHaveBeenCalledWith(99, [20, 30]);
    });
    expect(mockShowToast).toHaveBeenCalledWith('Home courts updated.', 'success');
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows a section-local catalog error while keeping saved courts editable', async () => {
    mockGetCourts.mockRejectedValueOnce(new Error('catalog unavailable'));
    const view = renderScreen();

    expect(await view.findByText('First Beach')).toBeTruthy();
    expect(await view.findByText('Available courts could not be loaded.')).toBeTruthy();
    expect(view.getByLabelText('Remove First Beach')).toBeTruthy();
  });

  it('keeps the editor open and reports a save failure', async () => {
    mockSetPlayerHomeCourts.mockRejectedValueOnce(new Error('save unavailable'));
    const view = renderScreen();
    await view.findByText('First Beach');

    fireEvent.press(view.getByLabelText('Save home courts'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
    });
    expect(mockBack).not.toHaveBeenCalled();
  });
});
