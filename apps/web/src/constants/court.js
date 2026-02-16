/**
 * Shared court-related constants.
 *
 * Single source of truth for surface types, photo limits, etc.
 * Import from here instead of hard-coding values in components.
 */

/** Surface type value → display label mapping. */
export const SURFACE_LABELS = {
  sand: 'Sand',
  grass: 'Grass',
  indoor_sand: 'Indoor Sand',
};

/** Surface options for form select dropdowns. */
export const SURFACE_OPTIONS = Object.entries(SURFACE_LABELS).map(
  ([value, label]) => ({ value, label })
);

/** Get human-readable label for a surface type string. */
export const getSurfaceLabel = (type) => SURFACE_LABELS[type] || type;

/** Max photos allowed per court review (must match backend MAX_PHOTOS_PER_REVIEW). */
export const MAX_PHOTOS_PER_REVIEW = 3;
