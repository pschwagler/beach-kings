import type { Court } from '@beach-kings/shared';

export type CourtSurface = 'indoor_sand' | 'sand' | 'grass' | 'hardcourt' | 'other';

/** Normalizes legacy API values at the presentation boundary. */
export function normalizeCourtSurface(surface: Court['surface_type']): CourtSurface {
  switch (surface?.trim().toLowerCase()) {
    case 'indoor':
    case 'indoor_sand':
    case 'indoor sand':
      return 'indoor_sand';
    case 'sand':
      return 'sand';
    case 'grass':
      return 'grass';
    case 'hardcourt':
    case 'hard court':
      return 'hardcourt';
    default:
      return 'other';
  }
}

export function isIndoorCourt(court: Pick<Court, 'surface_type'>): boolean {
  return normalizeCourtSurface(court.surface_type) === 'indoor_sand';
}

export function courtSurfaceLabel(court: Pick<Court, 'surface_type'>): string | null {
  switch (normalizeCourtSurface(court.surface_type)) {
    case 'indoor_sand':
      return 'Indoor sand';
    case 'sand':
      return 'Outdoor sand';
    case 'grass':
      return 'Grass';
    case 'hardcourt':
      return 'Hard court';
    default:
      return court.surface_type?.trim() || null;
  }
}
