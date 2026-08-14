/**
 * Court, court review, and court photo types.
 */

import type { CourtStatus } from './enums';

export interface CourtPhoto {
  id: number;
  url: string;
  caption?: string | null;
  sort_order?: number;
  created_at?: string | null;
  moderation_visibility?: import('./moderation').ModerationVisibility;
  target_type?: 'court_photo' | 'court_review_photo';
}

export interface CourtReview {
  id: number;
  court_id: number;
  rating: number;
  review_text: string | null;
  author: { player_id: number; full_name: string; avatar: string | null } | null;
  tags: Array<{ id: number; name: string; category: string | null }> | null;
  photos: CourtPhoto[] | null;
  created_at: string;
  updated_at: string;
  moderation_visibility?: import('./moderation').ModerationVisibility;
}

/** Returned by create/update/delete review endpoints. */
export interface ReviewActionResponse {
  review_id: number | null;
  average_rating: number | null;
  review_count: number;
}

/** A single active court check-in record returned by POST /api/courts/{id}/check-in. */
export interface CourtCheckIn {
  id: number;
  court_id: number;
  checked_in_at: string;
  expires_at: string;
}

/**
 * A single row in the check-in breakdown returned by
 * GET /api/public/courts/{slug}/check-ins.
 *
 * No player identities are included — only aggregate counts grouped by
 * level and gender.
 */
export interface CheckInBreakdownItem {
  level: string | null;
  gender: string | null;
  count: number;
}

/**
 * Response from GET /api/public/courts/{slug}/check-ins.
 *
 * Shape changed to aggregate-only to protect player privacy:
 *   { total: number, breakdown: CheckInBreakdownItem[] }
 */
export interface CourtCheckInsResponse {
  total: number;
  breakdown: CheckInBreakdownItem[];
}

/** Input for creating a new court review (POST /api/courts/{id}/reviews). */
export interface CreateCourtReviewInput {
  rating: number;
  review_text?: string | null;
  tag_ids?: number[];
}

/** Input for updating an existing court review (PUT /api/courts/{id}/reviews/{reviewId}). */
export interface UpdateCourtReviewInput {
  rating?: number;
  review_text?: string | null;
  tag_ids?: number[];
}

export type CourtWindExposure = 'sheltered' | 'mixed' | 'exposed';
export type CourtSandDepth = 'shallow' | 'typical' | 'deep';

export interface CourtEditChanges {
  name?: string;
  address?: string;
  description?: string | null;
  court_count?: number | null;
  surface_type?: string | null;
  is_free?: boolean | null;
  cost_info?: string | null;
  has_lights?: boolean | null;
  has_restrooms?: boolean | null;
  has_parking?: boolean | null;
  parking_info?: string | null;
  nets_provided?: boolean | null;
  hours?: string | null;
  phone?: string | null;
  wind_exposure?: CourtWindExposure | null;
  wind_notes?: string | null;
  sand_depth?: CourtSandDepth | null;
  sand_notes?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SuggestCourtEditInput {
  changes: CourtEditChanges;
  note?: string;
}

export interface CourtEditSuggestionReceipt {
  id: number;
  court_id: number;
  status: 'pending' | string;
  created_at: string | null;
}

export interface Court {
  id: number | string;
  name: string;
  surface_type?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
  slug?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  average_rating?: number | null;
  review_count?: number | null;
  court_count?: number | null;
  photo_count?: number | null;
  is_free?: boolean | null;
  has_lights?: boolean | null;
  has_restrooms?: boolean | null;
  has_parking?: boolean | null;
  nets_provided?: boolean | null;
  website?: string | null;
  wind_exposure?: CourtWindExposure | null;
  wind_notes?: string | null;
  sand_depth?: CourtSandDepth | null;
  sand_notes?: string | null;
  phone?: string | null;
  parking_info?: string | null;
  hours?: string | null;
  cost_info?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  distance_miles?: number | null;
  /** Whether the authenticated caller has saved this court to "My Courts". Present only on authenticated responses. */
  is_saved?: boolean | null;
  created_at?: string;
  reviews?: CourtReview[] | null;
  court_photos?: CourtPhoto[] | null;
  all_photos?: CourtPhoto[] | null;
  location_id?: string | null;
  location_name?: string | null;
  location_slug?: string | null;
  top_tags?: string[] | null;
  photo_url?: string | null;
  tags?: Array<{ id: number; name: string; category: string | null }> | null;
  status?: CourtStatus | null;
  submitted_by?: number | null;
  submitted_by_name?: string | null;
  position?: number;
}
