/**
 * User endpoints — user profile, player profile, account deletion, locations, geocoding, avatar, logout.
 */

import api from '../api-client';

/**
 * Get the current user's player profile
 */
export const getCurrentUserPlayer = async () => {
  const response = await api.get('/api/users/me/player');
  return response.data;
};

/**
 * Update the current user's player profile
 */
export const updatePlayerProfile = async (playerData: Record<string, any>) => {
  const response = await api.put('/api/users/me/player', playerData);
  return response.data;
};

/**
 * Update the current user's account information (name, email)
 */
export const updateUserProfile = async (userData: Record<string, any>) => {
  const response = await api.put('/api/users/me', userData);
  return response.data;
};

/**
 * Schedule account for deletion (30-day grace period).
 */
export const scheduleAccountDeletion = async () => {
  const response = await api.post('/api/users/me/delete');
  return response.data;
};

/**
 * Cancel a pending account deletion.
 */
export const cancelAccountDeletion = async () => {
  const response = await api.post('/api/users/me/cancel-deletion');
  return response.data;
};

/**
 * Get list of locations
 */
export const getLocations = async () => {
  const response = await api.get('/api/locations');
  return response.data;
};

/**
 * Get all locations with distances from given coordinates, sorted by closest first
 */
export const getLocationDistances = async (lat: number, lon: number) => {
  const response = await api.get('/api/locations/distances', {
    params: { lat, lon }
  });
  return response.data;
};

/**
 * Get city autocomplete suggestions from Geoapify (proxied through backend)
 */
export const getCityAutocomplete = async (text: string) => {
  const response = await api.get('/api/geocode/autocomplete', {
    params: { text }
  });
  return response.data;
};

/**
 * Logout the current user by invalidating refresh tokens
 */
export const logout = async () => {
  // Even if the logout request fails, we still want to clear local tokens
  // The user is already logged out from the client side
  const response = await api.post('/api/auth/logout');
  return response.data;
};

/** Fetch public location list (regions + locations) for dropdowns. */
export const getPublicLocations = async () => {
  const response = await api.get('/api/public/locations');
  return response.data;
};

/**
 * Upload a new avatar image for the current user.
 *
 * @param {File|Blob} file - Image file or blob to upload
 * @returns {Promise<{ profile_picture_url: string }>}
 */
export const uploadAvatar = async (file: File | Blob) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/api/users/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

/**
 * Delete the current user's avatar, reverting to initials.
 *
 * @returns {Promise<{ message: string }>}
 */
export const deleteAvatar = async () => {
  const response = await api.delete('/api/users/me/avatar');
  return response.data;
};
