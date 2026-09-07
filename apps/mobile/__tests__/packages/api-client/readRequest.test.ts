import type { AxiosInstance } from 'axios';
import { getRead, withRequestDeadline } from '../../../../../packages/api-client/src/readRequest';

describe('opt-in read deadlines', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('aborts the actual transport and bounds a promise stuck in interceptors', async () => {
    const get: jest.Mock = jest.fn(() => new Promise(() => undefined));
    const api = { get } as unknown as AxiosInstance;
    const request = getRead(api, '/read', undefined, { timeoutMs: 100 });
    const rejection = expect(request).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    await Promise.resolve();
    const config = get.mock.calls[0][1] as unknown as { signal: AbortSignal; timeout: number };
    expect(config.signal.aborted).toBe(false);
    jest.advanceTimersByTime(100);
    await rejection;
    expect(config.signal.aborted).toBe(true);
    expect(config.timeout).toBe(100);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('forwards Query cancellation, clears deadline, and cannot resolve late', async () => {
    let resolve!: (value: unknown) => void;
    const get: jest.Mock = jest.fn(() => new Promise(done => { resolve = done; }));
    const controller = new AbortController();
    const request = getRead({ get } as unknown as AxiosInstance, '/read', undefined, { signal: controller.signal });
    const rejection = expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await Promise.resolve();
    controller.abort();
    await rejection;
    expect((get.mock.calls[0][1] as unknown as { signal: AbortSignal }).signal.aborted).toBe(true);
    resolve({ data: 'late' });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('skips pre-cancelled work and preserves existing callers without options', async () => {
    const get = jest.fn().mockResolvedValue({ data: 'ok' });
    const api = { get } as unknown as AxiosInstance;
    const controller = new AbortController();
    controller.abort();
    await expect(getRead(api, '/read', undefined, { signal: controller.signal })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(get).not.toHaveBeenCalled();
    await getRead(api, '/read');
    expect(get).toHaveBeenCalledWith('/read');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('also bounds shared refresh exchange and clears timers on synchronous throw', async () => {
    const stuck = withRequestDeadline(() => new Promise(() => undefined), { timeoutMs: 50 });
    const rejection = expect(stuck).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    jest.advanceTimersByTime(50);
    await rejection;
    await expect(withRequestDeadline(() => { throw new Error('sync'); }, {})).rejects.toThrow('sync');
    expect(jest.getTimerCount()).toBe(0);
  });
});
