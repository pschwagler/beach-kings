/**
 * HomePage — unit tests for the profile-incomplete modal useEffect.
 *
 * Guards against the infinite render loop where:
 *   - currentUserPlayer initializes to null
 *   - isProfileIncomplete(null) returns true → openModal fires
 *   - onSuccess calls fetchCurrentUser → setCurrentUserPlayer({ ...player })
 *   - new object reference causes dep change → effect re-fires → loop
 *
 * The fix adds two guards inside the effect:
 *   1. if (currentUserPlayer === null) return  (not yet loaded)
 *   2. if (isModalOpen) return                 (modal already open)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Module mocks — declared before any import that loads those modules.
// All mocks use vi.fn() so tests can call .mockReturnValue() per case.
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams('tab=home');

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() })),
  usePathname: vi.fn(() => '/home'),
  useSearchParams: vi.fn(() => mockSearchParams),
}));

const mockOpenModal = vi.fn();

vi.mock('../../contexts/ModalContext', () => ({
  useModal: vi.fn(),
  MODAL_TYPES: {
    PLAYER_PROFILE: 'PLAYER_PROFILE',
    CREATE_LEAGUE: 'CREATE_LEAGUE',
  },
}));

const mockFetchCurrentUser = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../contexts/AuthModalContext', () => ({
  useAuthModal: vi.fn(() => ({ openAuthModal: vi.fn() })),
}));

// Stub all child components to avoid deep rendering
vi.mock('../home/HomeTab', () => ({ default: () => <div data-testid="home-tab" /> }));
vi.mock('../home/ProfileTab', () => ({ default: () => <div data-testid="profile-tab" /> }));
vi.mock('../home/LeaguesTab', () => ({ default: () => <div data-testid="leagues-tab" /> }));
vi.mock('../home/MyGamesTab', () => ({ default: () => <div data-testid="my-games-tab" /> }));
vi.mock('../home/FriendsTab', () => ({ default: () => <div data-testid="friends-tab" /> }));
vi.mock('../home/PendingInvitesTab', () => ({ default: () => <div data-testid="invites-tab" /> }));
vi.mock('../home/NotificationsTab', () => ({ default: () => <div data-testid="notifications-tab" /> }));
vi.mock('../home/MyStatsTab', () => ({ default: () => <div data-testid="my-stats-tab" /> }));
vi.mock('../home/MessagesTab', () => ({ default: () => <div data-testid="messages-tab" /> }));
vi.mock('../home/HomeMenuBar', () => ({ default: () => <nav data-testid="home-menu-bar" /> }));
vi.mock('../layout/NavBar', () => ({ default: () => <header data-testid="navbar" /> }));

vi.mock('../../services/api', () => ({
  createLeague: vi.fn(),
  addLeagueHomeCourt: vi.fn(),
}));

vi.mock('../../contexts/AppContext', () => ({
  useApp: vi.fn(() => ({ userLeagues: [], leaguesLoading: false, refreshLeagues: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// Subject under test — imported AFTER mocks are registered
// ---------------------------------------------------------------------------

import HomePage from '../HomePage';
import { useModal } from '../../contexts/ModalContext';
import { useAuth } from '../../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a default auth context value with optional overrides. */
function makeAuthValue(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 1, email: 'test@example.com' },
    currentUserPlayer: null,
    isAuthenticated: true,
    isInitializing: false,
    sessionExpired: false,
    fetchCurrentUser: mockFetchCurrentUser,
    logout: vi.fn(),
    ...overrides,
  };
}

/** Build a default modal context value with optional overrides. */
function makeModalValue(overrides: Record<string, unknown> = {}) {
  return {
    openModal: mockOpenModal,
    closeModal: vi.fn(),
    isOpen: false,
    modalType: null,
    modalProps: {},
    ...overrides,
  };
}

function renderHomePage() {
  return render(<HomePage />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HomePage — profile-incomplete modal effect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Provide safe defaults; individual tests override as needed.
    vi.mocked(useAuth).mockReturnValue(makeAuthValue() as ReturnType<typeof useAuth>);
    vi.mocked(useModal).mockReturnValue(makeModalValue() as ReturnType<typeof useModal>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT call openModal when currentUserPlayer is null (not yet loaded)', () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAuthValue({ currentUserPlayer: null }) as ReturnType<typeof useAuth>,
    );
    vi.mocked(useModal).mockReturnValue(
      makeModalValue({ isOpen: false }) as ReturnType<typeof useModal>,
    );

    renderHomePage();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it('does NOT call openModal when the modal is already open (isModalOpen = true)', () => {
    // Player has an incomplete profile — without the guard openModal would fire.
    vi.mocked(useAuth).mockReturnValue(
      makeAuthValue({
        currentUserPlayer: { id: 1, gender: null, level: null, city: null },
      }) as ReturnType<typeof useAuth>,
    );
    vi.mocked(useModal).mockReturnValue(
      makeModalValue({ isOpen: true }) as ReturnType<typeof useModal>,
    );

    renderHomePage();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it('calls openModal exactly once for a player with an incomplete profile', () => {
    const incompletePlayer = { id: 1, gender: null, level: 'beginner', city: null };

    vi.mocked(useAuth).mockReturnValue(
      makeAuthValue({ currentUserPlayer: incompletePlayer }) as ReturnType<typeof useAuth>,
    );
    vi.mocked(useModal).mockReturnValue(
      makeModalValue({ isOpen: false }) as ReturnType<typeof useModal>,
    );

    renderHomePage();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    expect(mockOpenModal).toHaveBeenCalledWith(
      'PLAYER_PROFILE',
      expect.objectContaining({ currentUserPlayer: incompletePlayer }),
    );
  });

  it('does NOT call openModal for a player with a complete profile', () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAuthValue({
        currentUserPlayer: { id: 1, gender: 'male', level: 'intermediate', city: 'San Diego' },
      }) as ReturnType<typeof useAuth>,
    );
    vi.mocked(useModal).mockReturnValue(
      makeModalValue({ isOpen: false }) as ReturnType<typeof useModal>,
    );

    renderHomePage();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(mockOpenModal).not.toHaveBeenCalled();
  });
});
