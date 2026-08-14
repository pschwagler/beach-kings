/**
 * Unit tests for season methods in packages/api-client/src/methods.ts.
 */

import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';

describe('season methods', () => {
  it('calls PUT /api/seasons/:id for updateSeason', async () => {
    const payload = {
      name: 'Fall 2026',
      start_date: '2026-09-01',
      end_date: '2026-11-10',
      scoring_system: 'points_system',
      points_per_win: 3,
      points_per_loss: 1,
    };
    const mockPut = jest.fn().mockResolvedValue({ data: { id: 12, ...payload } });
    const client = {
      axiosInstance: { put: mockPut },
    } as unknown as ApiClient;

    const methods = createApiMethods(client);
    const result = await methods.updateSeason(12, payload);

    expect(mockPut).toHaveBeenCalledWith('/api/seasons/12', payload);
    expect(result).toMatchObject({ id: 12, ...payload });
  });
});
