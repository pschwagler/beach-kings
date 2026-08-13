import {
  getQueryErrorKind,
  getQueryErrorPresentation,
  isRetryableQueryError,
  queryRetryDelay,
  shouldRetryQuery,
} from '@/infrastructure/query/retryPolicy';

function httpError(status: number, headers?: Record<string, unknown>) {
  return {
    isAxiosError: true,
    response: { status, headers },
  };
}

describe('query retry policy', () => {
  it.each([408, 425, 429, 500, 503])('retries transient HTTP %s responses', (status) => {
    expect(isRetryableQueryError(httpError(status))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('does not retry terminal HTTP %s responses', (status) => {
    expect(isRetryableQueryError(httpError(status))).toBe(false);
  });

  it('retries Axios transport failures and fetch-style TypeErrors', () => {
    expect(isRetryableQueryError({ isAxiosError: true })).toBe(true);
    expect(isRetryableQueryError(new TypeError('Network request failed'))).toBe(true);
  });

  it('stops after three automatic retries', () => {
    const error = httpError(503);
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(true);
    expect(shouldRetryQuery(3, error)).toBe(false);
  });

  it('uses exponential delay with bounded jitter', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(queryRetryDelay(0, httpError(503))).toBe(1_000);
    expect(queryRetryDelay(1, httpError(503))).toBe(2_000);
    expect(queryRetryDelay(2, httpError(503))).toBe(4_000);
  });

  it('never jitters beyond the maximum delay', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    expect(queryRetryDelay(10, httpError(503))).toBe(30_000);
  });

  it('honors a bounded Retry-After header', () => {
    expect(queryRetryDelay(0, httpError(429, { 'retry-after': '7' }))).toBe(7_000);
    expect(queryRetryDelay(0, httpError(429, { 'retry-after': '90' }))).toBe(30_000);
  });

  it('classifies terminal errors for screen-level copy', () => {
    expect(getQueryErrorKind(httpError(404))).toBe('not-found');
    expect(getQueryErrorKind(httpError(403))).toBe('forbidden');
    expect(getQueryErrorPresentation(httpError(404), 'League')).toEqual({
      title: 'League unavailable',
      description: 'It may have been removed or is no longer available to your account.',
    });
  });
});
