import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchBackend, BACKEND_URL } from '../server-fetch';

describe('BACKEND_URL', () => {
  it('defaults to http://localhost:8000 when BACKEND_INTERNAL_URL is not set', () => {
    expect(BACKEND_URL).toBe('http://localhost:8000');
  });
});

describe('fetchBackend', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('AbortSignal', { timeout: vi.fn(() => 'mock-signal') });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on a successful response', async () => {
    const data = { id: 1, name: 'Test' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(data),
    });

    const result = await fetchBackend('/api/test');

    expect(result).toEqual(data);
  });

  it('throws an Error containing the status code on a non-OK HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(fetchBackend('/api/missing')).rejects.toThrow('404');
  });

  it('logs to console.error and rethrows on a non-OK HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchBackend('/api/broken')).rejects.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it('rethrows a network error and logs it to console.error', async () => {
    const networkError = new Error('Failed to connect');
    mockFetch.mockRejectedValueOnce(networkError);

    await expect(fetchBackend('/api/test')).rejects.toThrow('Failed to connect');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      networkError.message,
    );
  });

  it('uses default revalidate of 300 when not specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchBackend('/api/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });

  it('uses a custom revalidate value when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchBackend('/api/test', { revalidate: 0 });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ next: { revalidate: 0 } }),
    );
  });

  it('merges custom headers with the default Content-Type header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchBackend('/api/test', { headers: { Authorization: 'Bearer x' } });

    const calledHeaders = mockFetch.mock.calls[0][1].headers;
    expect(calledHeaders).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer x',
    });
  });

  it('constructs the URL by combining BACKEND_URL with the given path', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchBackend('/api/test');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/test',
      expect.any(Object),
    );
  });

  it('passes the AbortSignal.timeout(10000) result as the signal option', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchBackend('/api/test');

    expect(AbortSignal.timeout).toHaveBeenCalledWith(10000);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: 'mock-signal' }),
    );
  });

  it('passes through extra rest options such as method', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchBackend('/api/test', { method: 'POST' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
