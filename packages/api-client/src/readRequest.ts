import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

/** Opt-in read budget; writes and uploads retain their existing behavior. */
export interface ReadRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export const HOME_READ_TIMEOUT_MS = 15_000;

export function readAbortError(): Error {
  return Object.assign(new Error('Read cancelled'), { name: 'AbortError', code: 'ERR_CANCELED' });
}

/** Bound the full promise, including auth interceptors, and abort the transport. */
export function getRead<T>(
  api: AxiosInstance,
  url: string,
  config?: AxiosRequestConfig,
  options?: ReadRequestOptions,
): Promise<AxiosResponse<T>> {
  if (options == null) return config == null ? api.get<T>(url) : api.get<T>(url, config);
  return withRequestDeadline(
    (signal, timeout) => api.get<T>(url, { ...config, signal, timeout }),
    options,
  );
}

/** Also used by the shared auth-refresh exchange, never by uploads or writes. */
export function withRequestDeadline<T>(
  request: (signal: AbortSignal, timeoutMs: number) => Promise<T>,
  options: ReadRequestOptions,
): Promise<T> {
  if (options.signal?.aborted) return Promise.reject(readAbortError());
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? HOME_READ_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      result();
    };
    const cancel = () => {
      finish(() => reject(readAbortError()));
      controller.abort();
    };
    const timer = setTimeout(() => {
      finish(() => reject(Object.assign(new Error('Read timed out. Please retry.'), {
        name: 'TimeoutError', code: 'ETIMEDOUT', isAxiosError: true,
      })));
      controller.abort();
    }, timeoutMs);
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) {
      cancel();
      return;
    }
    Promise.resolve().then(() => {
      if (controller.signal.aborted) throw readAbortError();
      return request(controller.signal, timeoutMs);
    }).then(
      response => finish(() => resolve(response)),
      error => finish(() => reject(error)),
    );
  });
}
