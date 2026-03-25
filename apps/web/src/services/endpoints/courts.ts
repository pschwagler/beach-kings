/**
 * Court endpoints — discovery, reviews, photos, admin courts, suggestions, leaderboard.
 */

import api from '../api-client';
import type { Court, CourtReview, CourtPhoto, ReviewActionResponse } from '../../types';

/**
 * Court API methods (legacy — admin CRUD)
 */
export const getCourts = async (locationId: number | null = null) => {
  const params = locationId ? { location_id: locationId } : {};
  const response = await api.get('/api/courts', { params });
  return response.data;
};

/**
 * Court Discovery API methods (public + auth)
 */

/** List approved courts with optional filters and pagination. */
export const getPublicCourts = async (filters: Record<string, any> = {}) => {
  const response = await api.get('/api/public/courts', { params: filters });
  return response.data;
};

/** Get full court detail by slug. */
export const getPublicCourtBySlug = async (slug: string): Promise<Court> => {
  const response = await api.get(`/api/public/courts/${slug}`);
  return response.data;
};

/** Get all curated court tags. */
export const getCourtTags = async () => {
  const response = await api.get('/api/public/courts/tags');
  return response.data;
};

/** Get nearby courts by lat/lng. */
export const getNearbyCourts = async (lat: number, lng: number, radius: number = 25, excludeId: number | null = null) => {
  const params: Record<string, any> = { lat, lng, radius };
  if (excludeId) params.exclude = excludeId;
  const response = await api.get('/api/public/courts/nearby', { params });
  return response.data;
};

/** Get the placeholder "Other / Private Court" for a location. */
export const getPlaceholderCourt = async (locationId: string | number) => {
  const response = await api.get('/api/courts/placeholder', { params: { location_id: locationId } });
  return response.data;
};

/** Submit a new court for admin approval. */
export const submitCourt = async (data: Record<string, any>) => {
  const response = await api.post('/api/courts/submit', data);
  return response.data;
};

/** Update court info (creator or admin). */
export const updateCourtDiscovery = async (courtId: number, data: Record<string, any>) => {
  const response = await api.put(`/api/courts/${courtId}/update`, data);
  return response.data;
};

/** Create a review for a court. */
export const createCourtReview = async (courtId: number, data: Record<string, any>): Promise<ReviewActionResponse> => {
  const response = await api.post(`/api/courts/${courtId}/reviews`, data);
  return response.data;
};

/** Update an existing review. */
export const updateCourtReview = async (courtId: number, reviewId: number, data: Record<string, any>): Promise<ReviewActionResponse> => {
  const response = await api.put(`/api/courts/${courtId}/reviews/${reviewId}`, data);
  return response.data;
};

/** Delete a review. */
export const deleteCourtReview = async (courtId: number, reviewId: number): Promise<ReviewActionResponse> => {
  const response = await api.delete(`/api/courts/${courtId}/reviews/${reviewId}`);
  return response.data;
};

/** Upload a photo to a review (multipart form data). */
export const uploadReviewPhoto = async (courtId: number, reviewId: number, file: File): Promise<CourtPhoto> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(
    `/api/courts/${courtId}/reviews/${reviewId}/photos`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
};

/** Submit an edit suggestion for a court. */
export const suggestCourtEdit = async (courtId: number, changes: Record<string, any>) => {
  const response = await api.post(`/api/courts/${courtId}/suggest-edit`, { changes });
  return response.data;
};

/** List edit suggestions for a court (creator/admin). */
export const getCourtEditSuggestions = async (courtId: number) => {
  const response = await api.get(`/api/courts/${courtId}/suggestions`);
  return response.data;
};

/** Approve or reject an edit suggestion. */
export const resolveCourtEditSuggestion = async (suggestionId: number, action: string) => {
  const response = await api.put(`/api/courts/suggestions/${suggestionId}?action=${action}`);
  return response.data;
};

/** Admin: list pending court submissions. */
export const getAdminPendingCourts = async () => {
  const response = await api.get('/api/admin-view/courts/pending');
  return response.data;
};

/** Admin: approve a court. */
export const adminApproveCourt = async (courtId: number) => {
  const response = await api.put(`/api/admin-view/courts/${courtId}/approve`);
  return response.data;
};

/** Admin: reject a court. */
export const adminRejectCourt = async (courtId: number) => {
  const response = await api.put(`/api/admin-view/courts/${courtId}/reject`);
  return response.data;
};

/** Admin: list all courts with search, status filter, pagination. */
export const getAdminAllCourts = async (params: Record<string, any> = {}) => {
  const response = await api.get('/api/admin-view/courts', { params });
  return response.data;
};

/** Admin: list all court edit suggestions with status filter, pagination. */
export const getAdminAllSuggestions = async (params: Record<string, any> = {}) => {
  const response = await api.get('/api/admin-view/courts/suggestions', { params });
  return response.data;
};

/** Admin: delete a standalone court photo. */
export const adminDeleteCourtPhoto = async (photoId: number) => {
  const response = await api.delete(`/api/admin-view/courts/photos/${photoId}`);
  return response.data;
};

/** Admin: reorder standalone court photos. */
export const adminReorderCourtPhotos = async (courtId: number, photoIds: number[]) => {
  const response = await api.put(`/api/admin-view/courts/${courtId}/photos/reorder`, { photo_ids: photoIds });
  return response.data;
};

/** Admin: delete any court review. */
export const adminDeleteReview = async (reviewId: number) => {
  const response = await api.delete(`/api/admin-view/courts/reviews/${reviewId}`);
  return response.data;
};

/** Fetch full court detail by numeric ID (uses public slug endpoint via redirect). */
export const getCourtDetailById = async (courtId: number, { bustCache = false }: { bustCache?: boolean } = {}): Promise<Court> => {
  const params = bustCache ? { _t: Date.now() } : {};
  const response = await api.get(`/api/public/courts/${courtId}`, { params });
  return response.data;
};

/** Upload a standalone photo to a court (multipart form data). */
export const uploadCourtPhoto = async (courtId: number, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(
    `/api/courts/${courtId}/photos`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
};

/** Get court leaderboard (top players by match count). */
export const getCourtLeaderboard = async (slug: string) => {
  const response = await api.get(`/api/public/courts/${slug}/leaderboard`);
  return response.data;
};
