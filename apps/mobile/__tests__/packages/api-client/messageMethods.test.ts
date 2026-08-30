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
  it('requests the selected conversation folder', async () => {
    const client = makeClient(jest.fn());
    const get = client.axiosInstance.get as jest.Mock;
    get.mockResolvedValue({ data: { items: [], total_count: 0 } });
    const methods = createApiMethods(client);

    await methods.getConversations(2, 25, 'hidden');

    expect(get).toHaveBeenCalledWith('/api/messages/conversations', {
      params: { page: 2, page_size: 25, folder: 'hidden' },
    });
  });

  it('marks the encoded conversation route read and returns the shared response', async () => {
    const response = { status: 'ok' as const, marked_count: 2 };
    const put = jest.fn().mockResolvedValue({ data: response });
    const methods = createApiMethods(makeClient(put));

    await expect(methods.markThreadRead(42)).resolves.toEqual(response);
    expect(put).toHaveBeenCalledWith(
      '/api/messages/conversations/42/read',
    );
  });

  it('hides an encoded conversation and returns its visibility', async () => {
    const response = { hidden: true };
    const put = jest.fn().mockResolvedValue({ data: response });
    const methods = createApiMethods(makeClient(put));

    await expect(methods.setConversationHidden(42, true)).resolves.toEqual(response);
    expect(put).toHaveBeenCalledWith(
      '/api/messages/conversations/42/visibility',
      { hidden: true },
    );
  });
});
