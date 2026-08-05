/**
 * Behavior tests for the court reviews feature.
 *
 * Covers:
 *   CourtReviewCard:
 *     - renders rating stars, author name, review text
 *     - renders tag pills when tags present
 *     - renders photo thumbnails when photos present
 *     - renders fallback initial avatar when author has no avatar
 *   CourtReviewsSection:
 *     - renders section with testID
 *     - shows exactly one CTA when no reviews
 *     - renders one CourtReviewCard per review
 *     - shows "Write a Review" button when no current-player review
 *     - shows "Edit Your Review" button when current player already reviewed
 *     - opens WriteReviewModal when the action button is pressed
 *   WriteReviewModal — CREATE flow:
 *     - renders in create mode when no existing review
 *     - disables submit until a star is selected
 *     - exposes the selected rating to assistive technology
 *     - calls api.createCourtReview and onReviewChanged on success
 *     - shows inline error message when api throws
 *   WriteReviewModal — EDIT flow:
 *     - opens prefilled in edit mode when currentPlayerId matches a review author
 *     - calls api.updateCourtReview on save
 *     - renders delete button in edit mode
 *     - calls api.deleteCourtReview when delete is confirmed
 */

import React from 'react';
import {
  render as renderWithoutQuery,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
    }) => <View testID={testID ?? 'safe-area'}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    Easing: { inOut: () => ({}), ease: {} },
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => [],
    Slot: ({ children }: { children?: React.ReactNode }) => <View testID="slot">{children}</View>,
  };
});

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    bgPage: '#f2f2f7',
    bgSurface: '#ffffff',
    bgElevated: '#ffffff',
    bgInset: '#f2f2f7',
    textDefault: '#1a1a1a',
    textMuted: '#6e6e73',
    textTertiary: '#8e8e93',
    textInverse: '#ffffff',
    borderStrong: '#c6c6c8',
    borderDivider: '#c6c6c8',
  }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

const mockCreateCourtReview = jest.fn();
const mockUpdateCourtReview = jest.fn();
const mockDeleteCourtReview = jest.fn();
const mockGetCourtTags = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    createCourtReview: (...args: unknown[]) => mockCreateCourtReview(...args),
    updateCourtReview: (...args: unknown[]) => mockUpdateCourtReview(...args),
    deleteCourtReview: (...args: unknown[]) => mockDeleteCourtReview(...args),
    getCourtTags: (...args: unknown[]) => mockGetCourtTags(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports — AFTER mocks
// ---------------------------------------------------------------------------

import CourtReviewCard from '../../../../src/components/screens/Venues/CourtReviewCard';
import CourtReviewsSection from '../../../../src/components/screens/Venues/CourtReviewsSection';
import WriteReviewModal from '../../../../src/components/screens/Venues/WriteReviewModal';

function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return renderWithoutQuery(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const REVIEW_NO_EXTRAS = {
  id: 10,
  court_id: 1,
  rating: 4,
  review_text: 'Great courts overall!',
  author: { player_id: 42, full_name: 'Alice Smith', avatar: null },
  tags: null,
  photos: null,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-01-15T10:00:00Z',
};

const REVIEW_WITH_EXTRAS = {
  id: 11,
  court_id: 1,
  rating: 5,
  review_text: 'Best sand in SoCal!',
  author: {
    player_id: 99,
    full_name: 'Bob Jones',
    avatar: 'https://example.com/avatar.jpg',
  },
  tags: [
    { id: 1, name: 'Clean Nets', category: 'Facility' },
    { id: 2, name: 'Good Vibe', category: 'Atmosphere' },
  ],
  photos: [
    { id: 1, url: 'https://example.com/photo1.jpg' },
    { id: 2, url: 'https://example.com/photo2.jpg' },
  ],
  created_at: '2026-02-01T12:00:00Z',
  updated_at: '2026-02-01T12:00:00Z',
};

const MOCK_COURT = {
  id: 1,
  name: 'Manhattan Beach Courts',
  slug: 'manhattan-beach',
  surface_type: 'sand',
  city: 'Manhattan Beach',
  state: 'CA',
  average_rating: 4.5,
  review_count: 2,
  reviews: [REVIEW_NO_EXTRAS, REVIEW_WITH_EXTRAS],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCourtTags.mockResolvedValue([]);
  mockGetCurrentUserPlayer.mockResolvedValue({ id: 99, player_id: 999, full_name: 'Tester' });
  mockCreateCourtReview.mockResolvedValue({ review_id: 20, average_rating: 4.5, review_count: 3 });
  mockUpdateCourtReview.mockResolvedValue({ review_id: 10, average_rating: 4.6, review_count: 2 });
  mockDeleteCourtReview.mockResolvedValue({ review_id: null, average_rating: 4.8, review_count: 1 });
});

// ---------------------------------------------------------------------------
// CourtReviewCard tests
// ---------------------------------------------------------------------------

describe('CourtReviewCard', () => {
  it('renders the review rating stars', () => {
    render(
      <CourtReviewCard
        review={REVIEW_NO_EXTRAS}
        currentPlayerId={999}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.getByTestId('review-card-stars')).toBeTruthy();
    expect(screen.getByLabelText('4 out of 5 stars')).toBeTruthy();
  });

  it('renders the author full name', () => {
    render(
      <CourtReviewCard
        review={REVIEW_NO_EXTRAS}
        currentPlayerId={999}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.getByText('Alice Smith')).toBeTruthy();
  });

  it('renders the review text', () => {
    render(
      <CourtReviewCard
        review={REVIEW_NO_EXTRAS}
        currentPlayerId={999}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.getByText('Great courts overall!')).toBeTruthy();
  });

  it('renders tag pills when tags are present', () => {
    render(
      <CourtReviewCard
        review={REVIEW_WITH_EXTRAS}
        currentPlayerId={999}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.getByText('Clean Nets')).toBeTruthy();
    expect(screen.getByText('Good Vibe')).toBeTruthy();
  });

  it('does not render tag section when tags are null', () => {
    render(
      <CourtReviewCard
        review={REVIEW_NO_EXTRAS}
        currentPlayerId={999}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('review-card-tags')).toBeNull();
  });

  it('renders photo thumbnails when photos are present', () => {
    render(
      <CourtReviewCard
        review={REVIEW_WITH_EXTRAS}
        currentPlayerId={999}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.getByTestId('review-card-photos')).toBeTruthy();
    expect(screen.getByLabelText('Review photo 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Review photo 2 of 2')).toBeTruthy();
  });

  it('renders fallback initial when author has no avatar', () => {
    render(
      <CourtReviewCard
        review={REVIEW_NO_EXTRAS}
        currentPlayerId={999}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.getByTestId('review-card-avatar-initial')).toBeTruthy();
  });

  it('renders avatar image when author has avatar url', () => {
    render(
      <CourtReviewCard
        review={REVIEW_WITH_EXTRAS}
        currentPlayerId={999}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.getByTestId('review-card-avatar-image')).toBeTruthy();
  });

  it('shows edit/delete actions when the review belongs to the current player', () => {
    render(
      <CourtReviewCard
        review={REVIEW_NO_EXTRAS}
        currentPlayerId={42}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.getByTestId('review-edit-btn')).toBeTruthy();
  });

  it('hides edit/delete actions when the review belongs to another player', () => {
    render(
      <CourtReviewCard
        review={REVIEW_NO_EXTRAS}
        currentPlayerId={999}
        courtId={1}
        onEditPress={jest.fn()}
        onDeleteSuccess={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('review-edit-btn')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CourtReviewsSection tests
// ---------------------------------------------------------------------------

describe('CourtReviewsSection', () => {
  it('renders with the correct testID', async () => {
    render(
      <CourtReviewsSection
        court={MOCK_COURT}
        currentPlayerId={999}
      />,
    );
    expect(screen.getByTestId('court-reviews-section')).toBeTruthy();
  });

  it('shows empty-state message and CTA when no reviews', async () => {
    const emptyCourtData = { ...MOCK_COURT, reviews: [], review_count: 0 };
    render(
      <CourtReviewsSection
        court={emptyCourtData}
        currentPlayerId={999}
      />,
    );
    expect(screen.getByTestId('reviews-empty-state')).toBeTruthy();
    expect(screen.getByText('No reviews yet. Be the first to review!')).toBeTruthy();
    expect(screen.getAllByText('Write a Review')).toHaveLength(1);
    expect(screen.getAllByTestId('write-review-btn')).toHaveLength(1);
  });

  it('renders one card per review when reviews are present', async () => {
    render(
      <CourtReviewsSection
        court={MOCK_COURT}
        currentPlayerId={999}
      />,
    );
    // Both review texts should appear
    expect(screen.getByText('Great courts overall!')).toBeTruthy();
    expect(screen.getByText('Best sand in SoCal!')).toBeTruthy();
  });

  it('shows "Write a Review" button when current player has not reviewed', () => {
    render(
      <CourtReviewsSection
        court={MOCK_COURT}
        currentPlayerId={999}
      />,
    );
    expect(screen.getByTestId('write-review-btn')).toBeTruthy();
    expect(screen.getByText('Write a Review')).toBeTruthy();
  });

  it('shows "Edit Your Review" when current player already has a review', () => {
    // currentPlayerId=42 matches REVIEW_NO_EXTRAS.author.player_id
    render(
      <CourtReviewsSection
        court={MOCK_COURT}
        currentPlayerId={42}
      />,
    );
    expect(screen.getByText('Edit Your Review')).toBeTruthy();
  });

  it('opens WriteReviewModal when write-review-btn is pressed', async () => {
    render(
      <CourtReviewsSection
        court={MOCK_COURT}
        currentPlayerId={999}
      />,
    );
    fireEvent.press(screen.getByTestId('write-review-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('write-review-modal')).toBeTruthy();
    });
  });

  it('calls onReviewChanged after a successful review action', async () => {
    const onReviewChanged = jest.fn();
    render(
      <CourtReviewsSection
        court={MOCK_COURT}
        currentPlayerId={999}
        onReviewChanged={onReviewChanged}
      />,
    );
    fireEvent.press(screen.getByTestId('write-review-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('write-review-modal')).toBeTruthy();
    });

    // Select 5 stars
    fireEvent.press(screen.getByTestId('star-btn-5'));

    // Submit
    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(mockCreateCourtReview).toHaveBeenCalledWith(1, {
        rating: 5,
        review_text: null,
        tag_ids: [],
      });
      expect(onReviewChanged).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// WriteReviewModal — CREATE flow
// ---------------------------------------------------------------------------

describe('WriteReviewModal — create flow', () => {
  it('renders in create mode with correct title', async () => {
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.getByTestId('write-review-modal')).toBeTruthy();
    expect(screen.getByText('Write a Review')).toBeTruthy();
  });

  it('disables submit until a star is selected', () => {
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('submit-review-btn').props.accessibilityState,
    ).toMatchObject({ disabled: true, busy: false });
    fireEvent.press(screen.getByTestId('submit-review-btn'));
    expect(mockCreateCourtReview).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('4 stars'));

    expect(
      screen.getByTestId('submit-review-btn').props.accessibilityState,
    ).toMatchObject({ disabled: false, busy: false });
  });

  it('exposes the exact selected rating as a radio selection', () => {
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText('4 stars'));

    expect(screen.getByLabelText('4 stars').props.accessibilityRole).toBe(
      'radio',
    );
    expect(
      screen.getByLabelText('4 stars').props.accessibilityState?.selected,
    ).toBe(true);
    expect(
      screen.getByLabelText('3 stars').props.accessibilityState?.selected,
    ).toBe(false);
  });

  it('calls createCourtReview with correct payload on submit', async () => {
    const onSuccess = jest.fn();
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={null}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );

    // Select 4 stars
    fireEvent.press(screen.getByTestId('star-btn-4'));
    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(mockCreateCourtReview).toHaveBeenCalledWith(1, {
        rating: 4,
        review_text: null,
        tag_ids: [],
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('includes review text when entered', async () => {
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('star-btn-3'));
    fireEvent.changeText(
      screen.getByTestId('review-text-input'),
      'Solid courts',
    );
    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(mockCreateCourtReview).toHaveBeenCalledWith(1, {
        rating: 3,
        review_text: 'Solid courts',
        tag_ids: [],
      });
    });
  });

  it('shows inline error when createCourtReview throws', async () => {
    mockCreateCourtReview.mockRejectedValue(new Error('Network error'));
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('star-btn-5'));
    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('review-error-msg')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// WriteReviewModal — EDIT flow
// ---------------------------------------------------------------------------

describe('WriteReviewModal — edit flow', () => {
  const EXISTING = {
    id: 10,
    rating: 3,
    review_text: 'It was okay.',
    tags: [{ id: 1, name: 'Clean Nets', category: 'Facility' }],
  };

  it('renders "Edit Your Review" title in edit mode', () => {
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={EXISTING}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.getByText('Edit Your Review')).toBeTruthy();
  });

  it('prefills the rating from the existing review', () => {
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={EXISTING}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    // The star button for the existing rating should be highlighted
    expect(screen.getByTestId('star-btn-selected-3')).toBeTruthy();
  });

  it('prefills the review text from the existing review', () => {
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={EXISTING}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.getByDisplayValue('It was okay.')).toBeTruthy();
  });

  it('calls updateCourtReview on save in edit mode', async () => {
    const onSuccess = jest.fn();
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={EXISTING}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(mockUpdateCourtReview).toHaveBeenCalledWith(1, 10, {
        rating: 3,
        review_text: 'It was okay.',
        tag_ids: [1],
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('renders a delete button in edit mode', () => {
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={EXISTING}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.getByTestId('delete-review-btn')).toBeTruthy();
  });

  it('calls deleteCourtReview and onSuccess when delete is confirmed', async () => {
    const onSuccess = jest.fn();
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={EXISTING}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );

    // Press delete → confirm prompt
    fireEvent.press(screen.getByTestId('delete-review-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-delete-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('confirm-delete-btn'));

    await waitFor(() => {
      expect(mockDeleteCourtReview).toHaveBeenCalledWith(1, 10);
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('cancels delete when cancel is pressed', async () => {
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={EXISTING}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('delete-review-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('cancel-delete-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('cancel-delete-btn'));

    await waitFor(() => {
      expect(mockDeleteCourtReview).not.toHaveBeenCalled();
    });
  });

  it('shows inline error when deleteCourtReview throws', async () => {
    mockDeleteCourtReview.mockRejectedValue(new Error('Server error'));
    render(
      <WriteReviewModal
        visible
        courtId={1}
        existingReview={EXISTING}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('delete-review-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-delete-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('confirm-delete-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('review-error-msg')).toBeTruthy();
    });
  });
});
