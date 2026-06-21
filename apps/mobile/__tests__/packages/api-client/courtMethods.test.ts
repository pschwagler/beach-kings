/**
 * Unit tests for the court check-in and review methods in api-client/methods.ts.
 *
 * Each test creates a minimal mock ApiClient (using jest.fn() on the relevant
 * HTTP verb), calls the method under test, and asserts:
 *   1. The correct URL was called.
 *   2. Any request body / params were forwarded correctly.
 *   3. The return value matches the mock response data.
 */

import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(overrides: Partial<{
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  delete: jest.Mock;
}>): ApiClient {
  return {
    axiosInstance: {
      get: overrides.get ?? jest.fn(),
      post: overrides.post ?? jest.fn(),
      put: overrides.put ?? jest.fn(),
      delete: overrides.delete ?? jest.fn(),
    },
  } as unknown as ApiClient;
}

// ---------------------------------------------------------------------------
// checkInToCourt
// ---------------------------------------------------------------------------

describe('checkInToCourt', () => {
  const mockCheckIn = {
    id: 7,
    court_id: 3,
    checked_in_at: '2026-06-21T10:00:00Z',
    expires_at: '2026-06-21T14:00:00Z',
  };

  it('calls POST /api/courts/{id}/check-in', async () => {
    const mockPost = jest.fn().mockResolvedValue({ data: mockCheckIn });
    const client = makeClient({ post: mockPost });
    const methods = createApiMethods(client);

    await methods.checkInToCourt(3);

    expect(mockPost).toHaveBeenCalledWith('/api/courts/3/check-in');
  });

  it('returns the check-in record from the response', async () => {
    const mockPost = jest.fn().mockResolvedValue({ data: mockCheckIn });
    const client = makeClient({ post: mockPost });
    const methods = createApiMethods(client);

    const result = await methods.checkInToCourt(3);

    expect(result).toEqual(mockCheckIn);
  });

  it('uses the provided courtId in the URL', async () => {
    const mockPost = jest.fn().mockResolvedValue({ data: { ...mockCheckIn, court_id: 99 } });
    const client = makeClient({ post: mockPost });
    const methods = createApiMethods(client);

    await methods.checkInToCourt(99);

    expect(mockPost.mock.calls[0][0]).toBe('/api/courts/99/check-in');
  });
});

// ---------------------------------------------------------------------------
// checkOutOfCourt
// ---------------------------------------------------------------------------

describe('checkOutOfCourt', () => {
  const mockCheckOut = { court_id: 3, checked_out: true };

  it('calls DELETE /api/courts/{id}/check-in', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ data: mockCheckOut });
    const client = makeClient({ delete: mockDelete });
    const methods = createApiMethods(client);

    await methods.checkOutOfCourt(3);

    expect(mockDelete).toHaveBeenCalledWith('/api/courts/3/check-in');
  });

  it('returns the checkout confirmation from the response', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ data: mockCheckOut });
    const client = makeClient({ delete: mockDelete });
    const methods = createApiMethods(client);

    const result = await methods.checkOutOfCourt(3);

    expect(result).toEqual({ court_id: 3, checked_out: true });
  });

  it('uses the provided courtId in the URL', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ data: { court_id: 42, checked_out: true } });
    const client = makeClient({ delete: mockDelete });
    const methods = createApiMethods(client);

    await methods.checkOutOfCourt(42);

    expect(mockDelete.mock.calls[0][0]).toBe('/api/courts/42/check-in');
  });
});

// ---------------------------------------------------------------------------
// getCourtCheckIns
// ---------------------------------------------------------------------------

describe('getCourtCheckIns', () => {
  const mockResponse = {
    count: 2,
    checked_in_players: [
      {
        id: 1,
        player_id: 10,
        player_name: 'Alice',
        avatar: null,
        checked_in_at: '2026-06-21T09:00:00Z',
        expires_at: '2026-06-21T13:00:00Z',
      },
      {
        id: 2,
        player_id: 11,
        player_name: 'Bob',
        avatar: 'https://example.com/bob.jpg',
        checked_in_at: '2026-06-21T09:30:00Z',
        expires_at: '2026-06-21T13:30:00Z',
      },
    ],
  };

  it('calls GET /api/public/courts/{slug}/check-ins with a string slug', async () => {
    const mockGet = jest.fn().mockResolvedValue({ data: mockResponse });
    const client = makeClient({ get: mockGet });
    const methods = createApiMethods(client);

    await methods.getCourtCheckIns('manhattan-beach');

    expect(mockGet.mock.calls[0][0]).toBe('/api/public/courts/manhattan-beach/check-ins');
  });

  it('calls GET /api/public/courts/{id}/check-ins with a numeric id', async () => {
    const mockGet = jest.fn().mockResolvedValue({ data: mockResponse });
    const client = makeClient({ get: mockGet });
    const methods = createApiMethods(client);

    await methods.getCourtCheckIns(5);

    expect(mockGet.mock.calls[0][0]).toBe('/api/public/courts/5/check-ins');
  });

  it('returns count and checked_in_players array', async () => {
    const mockGet = jest.fn().mockResolvedValue({ data: mockResponse });
    const client = makeClient({ get: mockGet });
    const methods = createApiMethods(client);

    const result = await methods.getCourtCheckIns('manhattan-beach');

    expect(result.count).toBe(2);
    expect(result.checked_in_players).toHaveLength(2);
    expect(result.checked_in_players[0].player_name).toBe('Alice');
  });

  it('returns empty checked_in_players when no one is checked in', async () => {
    const emptyResponse = { count: 0, checked_in_players: [] };
    const mockGet = jest.fn().mockResolvedValue({ data: emptyResponse });
    const client = makeClient({ get: mockGet });
    const methods = createApiMethods(client);

    const result = await methods.getCourtCheckIns('empty-court');

    expect(result.count).toBe(0);
    expect(result.checked_in_players).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createCourtReview
// ---------------------------------------------------------------------------

describe('createCourtReview', () => {
  const mockReviewAction = {
    review_id: 55,
    average_rating: 4.5,
    review_count: 11,
  };

  it('calls POST /api/courts/{id}/reviews', async () => {
    const mockPost = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ post: mockPost });
    const methods = createApiMethods(client);

    await methods.createCourtReview(3, { rating: 5 });

    expect(mockPost.mock.calls[0][0]).toBe('/api/courts/3/reviews');
  });

  it('forwards the input body to the API', async () => {
    const mockPost = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ post: mockPost });
    const methods = createApiMethods(client);

    const input = { rating: 4, review_text: 'Great courts', tag_ids: [1, 2] };
    await methods.createCourtReview(3, input);

    expect(mockPost.mock.calls[0][1]).toEqual(input);
  });

  it('returns the review action response', async () => {
    const mockPost = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ post: mockPost });
    const methods = createApiMethods(client);

    const result = await methods.createCourtReview(3, { rating: 5 });

    expect(result).toEqual(mockReviewAction);
  });

  it('accepts a review with only a rating (no optional fields)', async () => {
    const mockPost = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ post: mockPost });
    const methods = createApiMethods(client);

    await methods.createCourtReview(3, { rating: 3 });

    expect(mockPost).toHaveBeenCalledWith('/api/courts/3/reviews', { rating: 3 });
  });
});

// ---------------------------------------------------------------------------
// updateCourtReview
// ---------------------------------------------------------------------------

describe('updateCourtReview', () => {
  const mockReviewAction = {
    review_id: 55,
    average_rating: 4.2,
    review_count: 11,
  };

  it('calls PUT /api/courts/{courtId}/reviews/{reviewId}', async () => {
    const mockPut = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ put: mockPut });
    const methods = createApiMethods(client);

    await methods.updateCourtReview(3, 55, { rating: 4 });

    expect(mockPut.mock.calls[0][0]).toBe('/api/courts/3/reviews/55');
  });

  it('forwards the update input body to the API', async () => {
    const mockPut = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ put: mockPut });
    const methods = createApiMethods(client);

    const input = { rating: 4, review_text: 'Updated text', tag_ids: [3] };
    await methods.updateCourtReview(3, 55, input);

    expect(mockPut.mock.calls[0][1]).toEqual(input);
  });

  it('returns the updated review action response', async () => {
    const mockPut = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ put: mockPut });
    const methods = createApiMethods(client);

    const result = await methods.updateCourtReview(3, 55, { rating: 4 });

    expect(result).toEqual(mockReviewAction);
  });

  it('accepts a partial update with only review_text', async () => {
    const mockPut = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ put: mockPut });
    const methods = createApiMethods(client);

    await methods.updateCourtReview(3, 55, { review_text: 'Just updated text' });

    expect(mockPut).toHaveBeenCalledWith(
      '/api/courts/3/reviews/55',
      { review_text: 'Just updated text' },
    );
  });
});

// ---------------------------------------------------------------------------
// deleteCourtReview
// ---------------------------------------------------------------------------

describe('deleteCourtReview', () => {
  const mockReviewAction = {
    review_id: null,
    average_rating: 4.1,
    review_count: 10,
  };

  it('calls DELETE /api/courts/{courtId}/reviews/{reviewId}', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ delete: mockDelete });
    const methods = createApiMethods(client);

    await methods.deleteCourtReview(3, 55);

    expect(mockDelete.mock.calls[0][0]).toBe('/api/courts/3/reviews/55');
  });

  it('returns the post-deletion review action response', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ delete: mockDelete });
    const methods = createApiMethods(client);

    const result = await methods.deleteCourtReview(3, 55);

    expect(result).toEqual(mockReviewAction);
  });

  it('uses both courtId and reviewId in the URL', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ delete: mockDelete });
    const methods = createApiMethods(client);

    await methods.deleteCourtReview(7, 22);

    expect(mockDelete.mock.calls[0][0]).toBe('/api/courts/7/reviews/22');
  });

  it('returns null review_id after deletion', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ data: mockReviewAction });
    const client = makeClient({ delete: mockDelete });
    const methods = createApiMethods(client);

    const result = await methods.deleteCourtReview(3, 55);

    expect(result.review_id).toBeNull();
    expect(result.review_count).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// getCourtTags
// ---------------------------------------------------------------------------

describe('getCourtTags', () => {
  const mockTags = [
    { id: 1, name: 'Great Sand', slug: 'great-sand', category: 'quality', sort_order: 0 },
    { id: 2, name: 'Lively', slug: 'lively', category: 'vibe', sort_order: 1 },
  ];

  it('calls GET /api/public/courts/tags', async () => {
    const mockGet = jest.fn().mockResolvedValue({ data: mockTags });
    const client = makeClient({ get: mockGet });
    const methods = createApiMethods(client);

    await methods.getCourtTags();

    expect(mockGet.mock.calls[0][0]).toBe('/api/public/courts/tags');
  });

  it('returns the list of curated tags', async () => {
    const mockGet = jest.fn().mockResolvedValue({ data: mockTags });
    const client = makeClient({ get: mockGet });
    const methods = createApiMethods(client);

    const result = await methods.getCourtTags();

    expect(result).toHaveLength(2);
    expect(result[0].category).toBe('quality');
  });
});

// ---------------------------------------------------------------------------
// saveCourt
// ---------------------------------------------------------------------------

describe('saveCourt', () => {
  const mockSaved = { court_id: 5, saved: true };

  it('calls POST /api/users/me/courts with the court_id body', async () => {
    const mockPost = jest.fn().mockResolvedValue({ data: mockSaved });
    const client = makeClient({ post: mockPost });
    const methods = createApiMethods(client);

    await methods.saveCourt(5);

    expect(mockPost).toHaveBeenCalledWith('/api/users/me/courts', { court_id: 5 });
  });

  it('returns the saved state from the response', async () => {
    const mockPost = jest.fn().mockResolvedValue({ data: mockSaved });
    const client = makeClient({ post: mockPost });
    const methods = createApiMethods(client);

    const result = await methods.saveCourt(5);

    expect(result).toEqual({ court_id: 5, saved: true });
  });
});

// ---------------------------------------------------------------------------
// unsaveCourt
// ---------------------------------------------------------------------------

describe('unsaveCourt', () => {
  const mockUnsaved = { court_id: 5, saved: false };

  it('calls DELETE /api/users/me/courts/{id}', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ data: mockUnsaved });
    const client = makeClient({ delete: mockDelete });
    const methods = createApiMethods(client);

    await methods.unsaveCourt(5);

    expect(mockDelete).toHaveBeenCalledWith('/api/users/me/courts/5');
  });

  it('returns the unsaved state from the response', async () => {
    const mockDelete = jest.fn().mockResolvedValue({ data: mockUnsaved });
    const client = makeClient({ delete: mockDelete });
    const methods = createApiMethods(client);

    const result = await methods.unsaveCourt(5);

    expect(result).toEqual({ court_id: 5, saved: false });
  });
});

// ---------------------------------------------------------------------------
// getMyCourts
// ---------------------------------------------------------------------------

describe('getMyCourts', () => {
  const mockCards = [
    { id: 3, name: 'Saved Court', is_saved: true },
    { id: 4, name: 'Another Saved Court', is_saved: true },
  ];

  it('calls GET /api/users/me/courts', async () => {
    const mockGet = jest.fn().mockResolvedValue({ data: mockCards });
    const client = makeClient({ get: mockGet });
    const methods = createApiMethods(client);

    await methods.getMyCourts();

    expect(mockGet).toHaveBeenCalledWith('/api/users/me/courts');
  });

  it('returns the saved court cards from the response', async () => {
    const mockGet = jest.fn().mockResolvedValue({ data: mockCards });
    const client = makeClient({ get: mockGet });
    const methods = createApiMethods(client);

    const result = await methods.getMyCourts();

    expect(result).toHaveLength(2);
    expect(result[0].is_saved).toBe(true);
  });
});
