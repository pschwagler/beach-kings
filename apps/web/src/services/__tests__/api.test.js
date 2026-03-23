import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock axios before importing api module ────────────────────────────────────
const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('axios', () => {
  const createFn = vi.fn(() => ({
    get: mockGet,
    post: mockPost,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { headers: { common: {} } },
  }));
  return { default: { create: createFn } };
});

// ─── Import module under test (after mocks) ────────────────────────────────────
import {
  setAuthTokens,
  clearAuthTokens,
  getStoredTokens,
  getPlayers,
  getSessions,
  joinSessionByCode,
  getActiveSession,
  getLeagueJoinRequests,
} from '../api';

// ─── Helpers ────────────────────────────────────────────────────────────────────
const ACCESS_KEY = 'beach_access_token';
const REFRESH_KEY = 'beach_refresh_token';

// ─────────────────────────────────────────────────────────────────────────────
// A. Token storage helpers
// ─────────────────────────────────────────────────────────────────────────────
describe('setAuthTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('stores both tokens in localStorage', () => {
    setAuthTokens('access-123', 'refresh-456');
    expect(localStorage.getItem(ACCESS_KEY)).toBe('access-123');
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-456');
  });

  it('removes access token from localStorage when null', () => {
    localStorage.setItem(ACCESS_KEY, 'old');
    setAuthTokens(null, 'refresh-456');
    expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-456');
  });

  it('removes refresh token from localStorage when null', () => {
    localStorage.setItem(REFRESH_KEY, 'old');
    setAuthTokens('access-123', null);
    expect(localStorage.getItem(ACCESS_KEY)).toBe('access-123');
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('preserves existing refresh token when not provided', () => {
    localStorage.setItem(REFRESH_KEY, 'existing-refresh');
    // Call with only access — refresh defaults to current in-memory value
    setAuthTokens('new-access');
    expect(localStorage.getItem(ACCESS_KEY)).toBe('new-access');
  });
});

describe('clearAuthTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('removes both tokens from localStorage', () => {
    localStorage.setItem(ACCESS_KEY, 'a');
    localStorage.setItem(REFRESH_KEY, 'r');
    clearAuthTokens();
    expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('subsequent getStoredTokens returns nulls', () => {
    localStorage.setItem(ACCESS_KEY, 'a');
    clearAuthTokens();
    const tokens = getStoredTokens();
    expect(tokens.accessToken).toBeNull();
    expect(tokens.refreshToken).toBeNull();
  });
});

describe('getStoredTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('reads tokens from localStorage', () => {
    localStorage.setItem(ACCESS_KEY, 'a-tok');
    localStorage.setItem(REFRESH_KEY, 'r-tok');
    const tokens = getStoredTokens();
    expect(tokens.accessToken).toBe('a-tok');
    expect(tokens.refreshToken).toBe('r-tok');
  });

  it('returns nulls when localStorage is empty', () => {
    clearAuthTokens(); // ensure in-memory is also null
    const tokens = getStoredTokens();
    expect(tokens.accessToken).toBeNull();
    expect(tokens.refreshToken).toBeNull();
  });

  it('syncs in-memory tokens with localStorage', () => {
    // Set via localStorage directly (simulates another tab)
    localStorage.setItem(ACCESS_KEY, 'from-other-tab');
    const tokens = getStoredTokens();
    expect(tokens.accessToken).toBe('from-other-tab');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. Representative endpoint wrappers
// ─────────────────────────────────────────────────────────────────────────────
describe('getPlayers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds URLSearchParams with defaults', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    await getPlayers();

    const url = mockGet.mock.calls[0][0];
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=0');
    expect(url).toContain('include_placeholders=true');
  });

  it('handles array params for location_id', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    await getPlayers({ location_id: ['socal_sd', 'socal_la'] });

    const url = mockGet.mock.calls[0][0];
    expect(url).toContain('location_id=socal_sd');
    expect(url).toContain('location_id=socal_la');
  });

  it('handles scalar params for location_id', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    await getPlayers({ location_id: 'socal_sd' });

    const url = mockGet.mock.calls[0][0];
    expect(url).toContain('location_id=socal_sd');
  });

  it('handles array gender param', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    await getPlayers({ gender: ['male', 'female'] });

    const url = mockGet.mock.calls[0][0];
    expect(url).toContain('gender=male');
    expect(url).toContain('gender=female');
  });

  it('omits empty string params', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    await getPlayers({ q: '', location_id: '' });

    const url = mockGet.mock.calls[0][0];
    expect(url).not.toContain('q=');
    expect(url).not.toContain('location_id=');
  });

  it('passes search query', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    await getPlayers({ q: 'Alice' });

    const url = mockGet.mock.calls[0][0];
    expect(url).toContain('q=Alice');
  });

  it('passes abort signal', async () => {
    mockGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    const controller = new AbortController();
    await getPlayers({}, { signal: controller.signal });

    const config = mockGet.mock.calls[0][1];
    expect(config.signal).toBe(controller.signal);
  });
});

describe('getSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when leagueId is falsy', async () => {
    await expect(getSessions(null)).rejects.toThrow('leagueId is required');
    await expect(getSessions(0)).rejects.toThrow('leagueId is required');
    await expect(getSessions(undefined)).rejects.toThrow('leagueId is required');
  });

  it('fetches sessions for valid leagueId', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: 1, status: 'ACTIVE' }] });
    const result = await getSessions(5);
    expect(mockGet).toHaveBeenCalledWith('/api/leagues/5/sessions');
    expect(result).toEqual([{ id: 1, status: 'ACTIVE' }]);
  });
});

describe('getActiveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for falsy leagueId', async () => {
    const result = await getActiveSession(null);
    expect(result).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns the ACTIVE session', async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        { id: 1, status: 'COMPLETED' },
        { id: 2, status: 'ACTIVE' },
        { id: 3, status: 'COMPLETED' },
      ],
    });
    const result = await getActiveSession(5);
    expect(result).toEqual({ id: 2, status: 'ACTIVE' });
  });

  it('returns null when no ACTIVE session', async () => {
    mockGet.mockResolvedValueOnce({
      data: [{ id: 1, status: 'COMPLETED' }],
    });
    const result = await getActiveSession(5);
    expect(result).toBeNull();
  });
});

describe('joinSessionByCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trims and uppercases the code', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 1 } });
    await joinSessionByCode('  abc  ');
    expect(mockPost).toHaveBeenCalledWith('/api/sessions/join', { code: 'ABC' });
  });

  it('returns response data', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 99, code: 'XYZ' } });
    const result = await joinSessionByCode('xyz');
    expect(result).toEqual({ id: 99, code: 'XYZ' });
  });
});

describe('getLeagueJoinRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes well-formed response', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        pending: [{ id: 1 }],
        rejected: [{ id: 2 }],
      },
    });
    const result = await getLeagueJoinRequests(5);
    expect(result).toEqual({
      pending: [{ id: 1 }],
      rejected: [{ id: 2 }],
    });
  });

  it('normalizes missing pending/rejected to empty arrays', async () => {
    mockGet.mockResolvedValueOnce({ data: {} });
    const result = await getLeagueJoinRequests(5);
    expect(result).toEqual({ pending: [], rejected: [] });
  });

  it('normalizes null response data', async () => {
    mockGet.mockResolvedValueOnce({ data: null });
    const result = await getLeagueJoinRequests(5);
    expect(result).toEqual({ pending: [], rejected: [] });
  });

  it('normalizes non-array pending to empty array', async () => {
    mockGet.mockResolvedValueOnce({
      data: { pending: 'not-array', rejected: [{ id: 1 }] },
    });
    const result = await getLeagueJoinRequests(5);
    expect(result).toEqual({ pending: [], rejected: [{ id: 1 }] });
  });
});
