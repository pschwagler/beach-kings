const MAX_QUERY_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

interface HttpErrorShape {
  readonly isAxiosError?: boolean;
  readonly code?: string;
  readonly response?: {
    readonly status?: number;
    readonly headers?: Record<string, unknown>;
  };
}

export type QueryErrorKind =
  | 'network'
  | 'not-found'
  | 'forbidden'
  | 'unauthorized'
  | 'server'
  | 'unknown';

export interface QueryErrorPresentation {
  readonly title: string;
  readonly description: string;
}

function asHttpError(error: unknown): HttpErrorShape | null {
  return typeof error === 'object' && error != null
    ? error as HttpErrorShape
    : null;
}

export function getQueryErrorStatus(error: unknown): number | null {
  const status = asHttpError(error)?.response?.status;
  return typeof status === 'number' ? status : null;
}

export function getQueryErrorKind(error: unknown): QueryErrorKind {
  const status = getQueryErrorStatus(error);
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 408 || status === 425) return 'network';
  if (status === 429 || (status != null && status >= 500)) return 'server';

  const candidate = asHttpError(error);
  if (
    candidate?.isAxiosError === true
    && candidate.response == null
  ) {
    return 'network';
  }
  if (error instanceof TypeError) return 'network';

  return 'unknown';
}

export function isRetryableQueryError(error: unknown): boolean {
  const status = getQueryErrorStatus(error);
  if (status != null) {
    return status === 408
      || status === 425
      || status === 429
      || status >= 500;
  }

  const candidate = asHttpError(error);
  return (
    candidate?.isAxiosError === true && candidate.response == null
  ) || error instanceof TypeError;
}

export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableQueryError(error);
}

function retryAfterMs(error: unknown): number | null {
  const headers = asHttpError(error)?.response?.headers;
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
  }

  if (typeof raw === 'string') {
    const dateMs = Date.parse(raw);
    if (Number.isFinite(dateMs)) {
      return Math.min(Math.max(0, dateMs - Date.now()), MAX_RETRY_DELAY_MS);
    }
  }
  return null;
}

export function queryRetryDelay(
  failureCount: number,
  error: unknown,
): number {
  const serverDelay = retryAfterMs(error);
  if (serverDelay != null) return serverDelay;

  const exponentialDelay = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** failureCount,
    MAX_RETRY_DELAY_MS,
  );
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.min(
    Math.round(exponentialDelay * jitter),
    MAX_RETRY_DELAY_MS,
  );
}

export function getQueryErrorPresentation(
  error: unknown,
  resourceName: string,
): QueryErrorPresentation {
  switch (getQueryErrorKind(error)) {
    case 'network':
      return {
        title: 'Waiting for a connection',
        description: `We’ll reload ${resourceName} automatically when you’re back online.`,
      };
    case 'not-found':
      return {
        title: `${resourceName} unavailable`,
        description: `It may have been removed or is no longer available to your account.`,
      };
    case 'forbidden':
      return {
        title: `${resourceName} unavailable`,
        description: `You don’t currently have access to it.`,
      };
    case 'unauthorized':
      return {
        title: 'Session expired',
        description: 'Sign in again to continue.',
      };
    case 'server':
      return {
        title: `Couldn’t load ${resourceName}`,
        description: 'The service is temporarily unavailable. We’ll retry automatically.',
      };
    default:
      return {
        title: `Couldn’t load ${resourceName}`,
        description: 'Go back and reopen this screen in a moment.',
      };
  }
}
