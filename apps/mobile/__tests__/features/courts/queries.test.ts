import {
  courtKeys,
  courtQueries,
  invalidateCourtQueries,
} from '@/features/courts';
import { QueryClient } from '@tanstack/react-query';
import { courtSurfaceLabel, normalizeCourtSurface } from '@/features/courts/presentation';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: {
    getCourts: jest.fn(),
    getCourtById: jest.fn(),
    getCourtPhotos: jest.fn(),
    getCourtTags: jest.fn(),
  },
}));

describe('court query catalog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes viewer-specific catalog data beneath the authenticated user', () => {
    expect(courtKeys.catalog(41, null, null)).toEqual([
      'private',
      41,
      'courts',
      'catalog',
      null,
      null,
    ]);
    expect(courtKeys.catalog(42, null, null)).not.toEqual(
      courtKeys.catalog(41, null, null),
    );
  });

  it('always requests the complete catalog and includes location when known', async () => {
    jest.mocked(api.getCourts).mockResolvedValue([]);
    const options = courtQueries.catalog(7, { latitude: 40.7, longitude: -74 });
    await options.queryFn?.({} as never);

    expect(api.getCourts).toHaveBeenCalledWith({
      user_lat: 40.7,
      user_lng: -74,
      all: true,
    });
  });

  it('shares the private nearby definition across dashboard consumers', async () => {
    jest.mocked(api.getCourts).mockResolvedValue([]);
    const options = courtQueries.nearby(
      7,
      { latitude: 40.7, longitude: -74 },
      'ignored-location',
    );
    await options.queryFn?.({} as never);

    expect(options.queryKey).toEqual(
      courtKeys.nearby(7, 40.7, -74, null),
    );
    expect(api.getCourts).toHaveBeenCalledWith({
      user_lat: 40.7,
      user_lng: -74,
    });
    expect(courtKeys.nearby(7, null, null, 'socal_sd')).not.toEqual(
      courtKeys.nearby(8, null, null, 'socal_sd'),
    );
  });

  it('keeps review tags public and account independent', async () => {
    jest.mocked(api.getCourtTags).mockResolvedValue([]);
    const options = courtQueries.reviewTags();
    await options.queryFn?.({} as never);

    expect(options.queryKey).toEqual(['public', 'courts', 'review-tags']);
    expect(api.getCourtTags).toHaveBeenCalledTimes(1);
  });

  it('does not enable private court queries without an authenticated user', () => {
    expect(courtQueries.catalog(0, null).enabled).toBe(false);
    expect(courtQueries.nearby(0, null, null).enabled).toBe(false);
    expect(courtQueries.detail(0, 12).enabled).toBe(false);
  });

  it('invalidates all court views only for the affected account', async () => {
    const client = new QueryClient();
    const invalidateQueries = jest.spyOn(client, 'invalidateQueries');

    await invalidateCourtQueries(client, 7);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: courtKeys.all(7),
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: courtKeys.all(8),
    });
  });
});

describe('court surface presentation', () => {
  it.each(['indoor', 'indoor_sand', 'indoor sand'])(
    'accepts %s as indoor sand compatibility input',
    (surface) => {
      expect(normalizeCourtSurface(surface)).toBe('indoor_sand');
      expect(courtSurfaceLabel({ surface_type: surface })).toBe('Indoor sand');
    },
  );

  it('keeps outdoor sand distinct', () => {
    expect(normalizeCourtSurface('sand')).toBe('sand');
    expect(courtSurfaceLabel({ surface_type: 'sand' })).toBe('Outdoor sand');
  });
});
