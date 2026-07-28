import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';

function makeClient(put: jest.Mock): ApiClient {
  return {
    axiosInstance: {
      get: jest.fn(),
      post: jest.fn(),
      put,
      patch: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as ApiClient;
}

describe('message API response contracts', () => {
  it('marks the encoded conversation route read and returns the shared response', async () => {
    const response = { status: 'ok' as const, marked_count: 2 };
    const put = jest.fn().mockResolvedValue({ data: response });
    const methods = createApiMethods(makeClient(put));

    await expect(methods.markThreadRead(42)).resolves.toEqual(response);
    expect(put).toHaveBeenCalledWith(
      '/api/messages/conversations/42/read',
    );
  });
});
