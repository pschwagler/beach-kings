import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';

describe('moderation enforcement API methods', () => {
  it('loads the signed-in account moderation status', async () => {
    const status = {
      account_status: 'active',
      account_expires_at: null,
      account_case_id: null,
      interaction_restricted_until: '2099-01-01T00:00:00Z',
      interaction_restriction_case_id: 12,
      appeals: [],
    };
    const get = jest.fn().mockResolvedValue({ data: status });
    const api = createApiMethods({ axiosInstance: { get } } as unknown as ApiClient);

    await expect(api.getAccountModerationStatus()).resolves.toEqual(status);
    expect(get).toHaveBeenCalledWith('/api/moderation/account-status');
  });

  it('submits a case-scoped appeal', async () => {
    const receipt = { id: 3, case_id: 12, status: 'open' };
    const post = jest.fn().mockResolvedValue({ data: receipt });
    const api = createApiMethods({ axiosInstance: { post } } as unknown as ApiClient);

    await expect(api.createModerationAppeal({
      case_id: 12,
      statement: 'Please review the context for this decision.',
    })).resolves.toEqual(receipt);
    expect(post).toHaveBeenCalledWith('/api/moderation/appeals', {
      case_id: 12,
      statement: 'Please review the context for this decision.',
    });
  });
});
