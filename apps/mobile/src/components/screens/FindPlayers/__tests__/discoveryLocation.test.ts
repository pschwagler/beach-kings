import {
  findNearestHub,
  formatMetroLabel,
  hubDistanceMiles,
} from '../discoveryLocation';

const LOCATIONS = [
  {
    id: 'socal_sd',
    name: 'San Diego',
    city: 'San Diego',
    state: 'CA',
    latitude: 32.72,
    longitude: -117.16,
  },
  {
    id: 'socal_la',
    name: 'Los Angeles',
    city: 'Los Angeles',
    state: 'CA',
    latitude: 34.05,
    longitude: -118.24,
  },
  {
    id: 'missing_centroid',
    name: 'Missing',
    city: '',
    state: '',
  },
];

describe('discovery location privacy helpers', () => {
  it('chooses the nearest valid hub centroid', () => {
    expect(
      findNearestHub(LOCATIONS, { latitude: 32.73, longitude: -117.15 })?.id,
    ).toBe('socal_sd');
  });

  it('returns no origin without device coordinates or valid hubs', () => {
    expect(findNearestHub(LOCATIONS, null)).toBeNull();
    expect(
      findNearestHub([LOCATIONS[2]], { latitude: 32.73, longitude: -117.15 }),
    ).toBeNull();
  });

  it('computes centroid distance in miles', () => {
    expect(
      hubDistanceMiles(
        { latitude: 0, longitude: 0 },
        { latitude: 0.1, longitude: 0 },
      ),
    ).toBeGreaterThan(6.8);
  });

  it('formats a catalog name with a city/state fallback', () => {
    expect(formatMetroLabel(LOCATIONS[0])).toBe('San Diego');
    expect(
      formatMetroLabel({
        id: 'fallback',
        name: null,
        city: 'Montreal',
        state: 'QC',
      }),
    ).toBe('Montreal, QC');
  });
});
