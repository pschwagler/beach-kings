/**
 * Unit tests for the CourtActionRow component.
 *
 * Covers:
 *   - Renders "Check In" button with correct testID
 *   - Renders "My Courts" button with correct testID in default (unsaved) state
 *   - Shows "N here now" label when total > 0
 *   - Does NOT show count label when total is 0
 *   - Shows breakdown chips when total > 0 and breakdown has items
 *   - Does NOT show breakdown when total is 0
 *   - Handles null level/gender in breakdown (renders "Unspecified")
 *   - Shows checked-in state (disabled button) when isCheckedIn is true
 *   - Calls checkIn() when the button is pressed (not already checked in)
 *   - Does NOT call checkIn() when already checked in (button is non-interactive)
 *   - Shows "Saved" label when isSaved is true
 *   - Calls toggle() when My Courts button is pressed
 *   - My Courts button is disabled while isSaveSubmitting
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCheckIn = jest.fn().mockResolvedValue(undefined);
const mockToggleSave = jest.fn().mockResolvedValue(undefined);
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);

jest.mock('@/utils/haptics', () => ({
  hapticMedium: () => mockHapticMedium(),
}));

// Mock check-in hook
const mockUseCourtCheckIn = jest.fn();
jest.mock(
  '../../../../src/components/screens/Venues/useCourtCheckIn',
  () => ({
    useCourtCheckIn: (...args: unknown[]) => mockUseCourtCheckIn(...args),
  }),
);

// Mock save hook
const mockUseSaveCourt = jest.fn();
jest.mock(
  '../../../../src/components/screens/Venues/useSaveCourt',
  () => ({
    useSaveCourt: (...args: unknown[]) => mockUseSaveCourt(...args),
  }),
);

// Mock usePaletteColors (used for borderColor prop in saved state)
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ brandTeal: '#00b4a2' }),
}));

// ---------------------------------------------------------------------------
// Module under test — imported AFTER mocks
// ---------------------------------------------------------------------------

import CourtActionRow from '../../../../src/components/screens/Venues/CourtActionRow';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_COURT = {
  id: 1,
  slug: 'manhattan-beach',
  name: 'Manhattan Beach Courts',
  surface_type: 'sand' as const,
  city: 'Manhattan Beach',
  state: 'CA',
  average_rating: 4.6,
  review_count: 42,
  is_active: true,
};

const DEFAULT_HOOK_STATE = {
  total: 0,
  breakdown: [],
  isCheckedIn: false,
  isSubmitting: false,
  error: null,
  isLoading: false,
  checkIn: mockCheckIn,
};

const DEFAULT_SAVE_HOOK_STATE = {
  isSaved: false,
  isSubmitting: false,
  error: null,
  toggle: mockToggleSave,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCourtCheckIn.mockReturnValue(DEFAULT_HOOK_STATE);
  mockUseSaveCourt.mockReturnValue(DEFAULT_SAVE_HOOK_STATE);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CourtActionRow — Check In button', () => {
  it('renders the Check In button with testID check-in-btn-{courtId}', () => {
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByTestId('check-in-btn-1')).toBeTruthy();
  });

  it('renders "Check In" label when not already checked in', () => {
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByText('Check In')).toBeTruthy();
  });

  it('calls hook checkIn when button is pressed (not checked in)', async () => {
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    fireEvent.press(screen.getByTestId('check-in-btn-1'));
    await waitFor(() => {
      expect(mockCheckIn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('CourtActionRow — checked-in state', () => {
  it('shows "Checked In" label when already checked in', () => {
    mockUseCourtCheckIn.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      isCheckedIn: true,
      total: 2,
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={42} />);
    expect(screen.getByText('Checked In')).toBeTruthy();
  });

  it('renders checked-in testID when already checked in', () => {
    mockUseCourtCheckIn.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      isCheckedIn: true,
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={42} />);
    // testID is check-in-btn-{id} regardless of state so existing tests pass
    expect(screen.getByTestId('check-in-btn-1')).toBeTruthy();
  });

  it('does not call checkIn when button is pressed in checked-in state', () => {
    mockUseCourtCheckIn.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      isCheckedIn: true,
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={42} />);
    // The button should be non-interactive (disabled)
    const btn = screen.getByTestId('check-in-btn-1');
    fireEvent.press(btn);
    expect(mockCheckIn).not.toHaveBeenCalled();
  });
});

describe('CourtActionRow — count display', () => {
  it('shows "N here now" label when total > 0', () => {
    mockUseCourtCheckIn.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      total: 3,
      breakdown: [{ level: 'Intermediate', gender: 'Women', count: 3 }],
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByText('3 here now')).toBeTruthy();
  });

  it('shows singular "1 here now" when total is 1', () => {
    mockUseCourtCheckIn.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      total: 1,
      breakdown: [{ level: 'Beginner', gender: 'Men', count: 1 }],
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByText('1 here now')).toBeTruthy();
  });

  it('does NOT show count label when total is 0', () => {
    mockUseCourtCheckIn.mockReturnValue({ ...DEFAULT_HOOK_STATE, total: 0 });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.queryByText(/here now/)).toBeNull();
  });
});

describe('CourtActionRow — breakdown chips', () => {
  it('shows breakdown chips when total > 0', () => {
    mockUseCourtCheckIn.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      total: 3,
      breakdown: [
        { level: 'Intermediate', gender: 'Women', count: 2 },
        { level: 'Advanced', gender: 'Men', count: 1 },
      ],
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByTestId('check-in-breakdown')).toBeTruthy();
    expect(screen.getByTestId('check-in-breakdown-chip-0')).toBeTruthy();
    expect(screen.getByTestId('check-in-breakdown-chip-1')).toBeTruthy();
  });

  it('renders chip text in "Level · Gender · Count" format', () => {
    mockUseCourtCheckIn.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      total: 2,
      breakdown: [{ level: 'Intermediate', gender: 'Women', count: 2 }],
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByText('Intermediate · Women · 2')).toBeTruthy();
  });

  it('renders "Unspecified" for null level and gender', () => {
    mockUseCourtCheckIn.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      total: 1,
      breakdown: [{ level: null, gender: null, count: 1 }],
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByText('Unspecified · Unspecified · 1')).toBeTruthy();
  });

  it('does NOT show breakdown when total is 0', () => {
    mockUseCourtCheckIn.mockReturnValue({ ...DEFAULT_HOOK_STATE, total: 0, breakdown: [] });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.queryByTestId('check-in-breakdown')).toBeNull();
  });
});

describe('CourtActionRow — My Courts button (unsaved / default state)', () => {
  it('renders the My Courts button with testID add-court-btn-{courtId}', () => {
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByTestId('add-court-btn-1')).toBeTruthy();
  });

  it('renders "My Courts" label in default (unsaved) state', () => {
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByText('My Courts')).toBeTruthy();
  });

  it('calls toggle when My Courts button is pressed', async () => {
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    fireEvent.press(screen.getByTestId('add-court-btn-1'));
    await waitFor(() => {
      expect(mockToggleSave).toHaveBeenCalledTimes(1);
    });
  });
});

describe('CourtActionRow — My Courts button (saved / active state)', () => {
  it('renders "Saved" label when isSaved is true', () => {
    mockUseSaveCourt.mockReturnValue({
      ...DEFAULT_SAVE_HOOK_STATE,
      isSaved: true,
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('still has testID add-court-btn-{courtId} when saved', () => {
    mockUseSaveCourt.mockReturnValue({
      ...DEFAULT_SAVE_HOOK_STATE,
      isSaved: true,
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByTestId('add-court-btn-1')).toBeTruthy();
  });

  it('calls toggle when Saved button is pressed', async () => {
    mockUseSaveCourt.mockReturnValue({
      ...DEFAULT_SAVE_HOOK_STATE,
      isSaved: true,
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    fireEvent.press(screen.getByTestId('add-court-btn-1'));
    await waitFor(() => {
      expect(mockToggleSave).toHaveBeenCalledTimes(1);
    });
  });

  it('disables button while isSaveSubmitting is true', () => {
    mockUseSaveCourt.mockReturnValue({
      ...DEFAULT_SAVE_HOOK_STATE,
      isSubmitting: true,
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    const btn = screen.getByTestId('add-court-btn-1');
    fireEvent.press(btn);
    expect(mockToggleSave).not.toHaveBeenCalled();
  });

  it('passes court and currentPlayerId to useSaveCourt', () => {
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={42} />);
    expect(mockUseSaveCourt).toHaveBeenCalledWith(MOCK_COURT, 42, undefined);
  });
});

describe('CourtActionRow — hook wiring', () => {
  it('passes court and currentPlayerId to useCourtCheckIn', () => {
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={42} />);
    expect(mockUseCourtCheckIn).toHaveBeenCalledWith(MOCK_COURT, 42);
  });

  it('shows submitting state label while isSubmitting is true', () => {
    mockUseCourtCheckIn.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      isSubmitting: true,
    });
    render(<CourtActionRow court={MOCK_COURT} currentPlayerId={1} />);
    expect(screen.getByText('Checking in...')).toBeTruthy();
  });
});
