import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('../../api-client', () => ({
  default: { get: mockGet },
}));

import { getPublicCourts } from '../courts';

describe('getPublicCourts bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { items: [], total_count: 0 } });
  });

  it('sends canonical crossing bounds without mutating caller filters', async () => {
    const filters = {
      page: 1,
      north: 10,
      south: -10,
      west: 179,
      east: 181,
    } as const;
    const before = { ...filters };

    await getPublicCourts(filters);

    expect(filters).toEqual(before);
    expect(mockGet).toHaveBeenCalledWith('/api/public/courts', {
      params: {
        page: 1,
        north: 10,
        south: -10,
        west: 179,
        east: -179,
      },
      signal: undefined,
    });
  });
});
