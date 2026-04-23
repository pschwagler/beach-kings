/**
 * Court, court review, and court photo types.
 */

import type { CourtStatus } from './enums';

export interface CourtPhoto {
  id: number;
  url: string;
  created_at?: string;
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
}

/** Returned by create/update/delete review endpoints. */
export interface ReviewActionResponse {
  review_id: number | null;
  average_rating: number | null;
  review_count: number;
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
  phone?: string | null;
  parking_info?: string | null;
  hours?: string | null;
  cost_info?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  distance_miles?: number | null;
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
