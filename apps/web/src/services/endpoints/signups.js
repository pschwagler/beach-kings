/**
 * Signup endpoints — signup CRUD, weekly schedules, signup events.
 */

import api from '../api-client';

/**
 * Weekly Schedule API methods
 */

/**
 * Create a weekly schedule for a season
 */
export const createWeeklySchedule = async (seasonId, scheduleData) => {
  const response = await api.post(`/api/seasons/${seasonId}/weekly-schedules`, scheduleData);
  return response.data;
};

/**
 * Get weekly schedules for a season
 */
export const getWeeklySchedules = async (seasonId) => {
  const response = await api.get(`/api/seasons/${seasonId}/weekly-schedules`);
  return response.data;
};

/**
 * Update a weekly schedule
 */
export const updateWeeklySchedule = async (scheduleId, scheduleData) => {
  const response = await api.put(`/api/weekly-schedules/${scheduleId}`, scheduleData);
  return response.data;
};

/**
 * Delete a weekly schedule
 */
export const deleteWeeklySchedule = async (scheduleId) => {
  const response = await api.delete(`/api/weekly-schedules/${scheduleId}`);
  return response.data;
};

/**
 * Signup API methods
 */

/**
 * Create an ad-hoc signup for a season
 */
export const createSignup = async (seasonId, signupData) => {
  const response = await api.post(`/api/seasons/${seasonId}/signups`, signupData);
  return response.data;
};

/**
 * Get signups for a season
 */
export const getSignups = async (seasonId, options = {}) => {
  const params = new URLSearchParams();
  if (options.upcoming_only) params.append('upcoming_only', 'true');
  if (options.past_only) params.append('past_only', 'true');
  if (options.include_players) params.append('include_players', 'true');
  const queryString = params.toString();
  const url = `/api/seasons/${seasonId}/signups${queryString ? `?${queryString}` : ''}`;
  const response = await api.get(url);
  return response.data;
};

/**
 * Get a signup by ID with players list
 */
export const getSignup = async (signupId) => {
  const response = await api.get(`/api/signups/${signupId}`);
  return response.data;
};

/**
 * Update a signup
 */
export const updateSignup = async (signupId, signupData) => {
  const response = await api.put(`/api/signups/${signupId}`, signupData);
  return response.data;
};

/**
 * Delete a signup
 */
export const deleteSignup = async (signupId) => {
  const response = await api.delete(`/api/signups/${signupId}`);
  return response.data;
};

/**
 * Sign up a player for a signup
 */
export const signupForSignup = async (signupId) => {
  const response = await api.post(`/api/signups/${signupId}/signup`);
  return response.data;
};

/**
 * Drop out a player from a signup
 */
export const dropoutFromSignup = async (signupId) => {
  const response = await api.post(`/api/signups/${signupId}/dropout`);
  return response.data;
};

/**
 * Get players signed up for a signup
 */
export const getSignupPlayers = async (signupId) => {
  const response = await api.get(`/api/signups/${signupId}/players`);
  return response.data;
};

/**
 * Get event log for a signup
 */
export const getSignupEvents = async (signupId) => {
  const response = await api.get(`/api/signups/${signupId}/events`);
  return response.data;
};
