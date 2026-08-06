import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';

function makeClient(post: jest.Mock, get = jest.fn()): ApiClient {
  return { axiosInstance: { get, post, put: jest.fn(), delete: jest.fn() } } as unknown as ApiClient;
}

describe('court conditions and edit suggestions', () => {
  it('normalizes unsupported condition values to null', async () => {
    const get = jest.fn().mockResolvedValue({ data: {
      id: 12, name: 'Beach Park', wind_exposure: 'sometimes',
      wind_notes: 123, sand_depth: 'deep', sand_notes: 'Soft after rain',
    } });
    const methods = createApiMethods(makeClient(jest.fn(), get));
    await expect(methods.getCourtById(12)).resolves.toMatchObject({
      wind_exposure: null, wind_notes: null,
      sand_depth: 'deep', sand_notes: 'Soft after rain',
    });
  });

  it('posts the canonical envelope and normalizes its receipt', async () => {
    const post = jest.fn().mockResolvedValue({ data: { id: 5, court_id: 12, status: 'pending' } });
    const methods = createApiMethods(makeClient(post));
    const input = {
      changes: { wind_exposure: 'exposed' as const, latitude: 40.1, longitude: -74.2 },
      note: 'Pin is at the parking lot.',
    };
    await expect(methods.suggestCourtEdit(12, input)).resolves.toEqual({
      id: 5, court_id: 12, status: 'pending', created_at: null,
    });
    expect(post).toHaveBeenCalledWith('/api/courts/12/suggest-edit', input);
  });

  it('rejects an unpaired coordinate before calling the API', async () => {
    const post = jest.fn();
    const methods = createApiMethods(makeClient(post));
    await expect(methods.suggestCourtEdit(12, { changes: { latitude: 40.1 } }))
      .rejects.toThrow('Latitude and longitude must be suggested together.');
    expect(post).not.toHaveBeenCalled();
  });
});
