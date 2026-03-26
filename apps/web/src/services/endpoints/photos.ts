/**
 * Photo match endpoints — upload, job status, SSE stream, edit/confirm/cancel.
 */

import api, { getStoredTokens, API_BASE_URL } from '../api-client';
import { createParser } from 'eventsource-parser';

/**
 * Upload a photo of game scores for AI processing
 * @param {number} leagueId - League ID
 * @param {File} file - Image file
 * @param {string} userPrompt - Optional context/instructions
 * @param {number} seasonId - Optional season ID
 */
export const uploadMatchPhoto = async (leagueId: number, file: File, userPrompt: string | null = null, seasonId: number | null = null) => {
  const formData = new FormData();
  formData.append('file', file);
  if (userPrompt) {
    formData.append('user_prompt', userPrompt);
  }
  if (seasonId) {
    formData.append('season_id', String(seasonId));
  }

  const response = await api.post(`/api/leagues/${leagueId}/matches/upload-photo`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

/**
 * Get status of a photo processing job
 * @param {number} leagueId - League ID
 * @param {number} jobId - Job ID
 */
export const getPhotoJobStatus = async (leagueId: number, jobId: number) => {
  const response = await api.get(`/api/leagues/${leagueId}/matches/photo-jobs/${jobId}`);
  return response.data;
};

/**
 * Returns the SSE stream URL for a photo job (for use with fetch + credentials).
 * @param {number} leagueId - League ID
 * @param {number} jobId - Job ID
 * @returns {string} Full URL for GET .../photo-jobs/{jobId}/stream
 */
export const getPhotoJobStreamUrl = (leagueId: number, jobId: number) => {
  const isBrowser = typeof window !== 'undefined';
  const base = API_BASE_URL || (isBrowser ? '' : '');
  return `${base}/api/leagues/${leagueId}/matches/photo-jobs/${jobId}/stream`;
};

/**
 * Subscribe to photo job progress via SSE. Uses fetch with credentials so auth headers are sent.
 * Call the returned abort function to close the stream.
 * @param {number} leagueId - League ID
 * @param {number} jobId - Job ID
 * @param {{ onPartial: (data: { partial_matches: unknown[] }) => void, onDone: (data: { status: string, result?: unknown }) => void, onError: (data: { message: string }) => void }} callbacks
 * @returns {() => void} Abort function to close the stream
 */
export const subscribePhotoJobStream = (leagueId: number, jobId: number, callbacks: { onPartial: (data: { partial_matches: any[] }) => void; onDone: (data: { status: string; result?: any }) => void; onError: (data: { message: string }) => void }) => {
  const url = getPhotoJobStreamUrl(leagueId, jobId);
  const { accessToken } = getStoredTokens();
  const headers: any = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { ...headers },
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) {
        callbacks.onError({ message: response.status === 404 ? 'Job not found' : response.status === 403 ? 'Access denied' : `Request failed: ${response.status}` });
        return;
      }
      if (!response.body) {
        callbacks.onError({ message: 'Response body is not readable' });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = createParser({
        onEvent(event) {
          const { event: eventName, data: dataStr } = event;
          if (!eventName || !dataStr) return;
          try {
            const data = JSON.parse(dataStr);
            if (eventName === 'partial') callbacks.onPartial(data);
            else if (eventName === 'done') callbacks.onDone(data);
            else if (eventName === 'error') callbacks.onError(data);
          } catch (err) {
            console.error('Error parsing SSE data:', err);
          }
        },
        onError(err) {
          console.error('SSE parse error:', err);
        },
      });
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      callbacks.onError({ message: err.message || 'Stream error' });
    }
  })();

  return () => controller.abort();
};

/**
 * Send edit prompt for photo results refinement
 * @param {number} leagueId - League ID
 * @param {string} sessionId - Photo session ID
 * @param {string} editPrompt - Edit/clarification prompt
 */
export const editPhotoResults = async (leagueId: number, sessionId: string, editPrompt: string) => {
  const response = await api.post(
    `/api/leagues/${leagueId}/matches/photo-sessions/${sessionId}/edit`,
    { edit_prompt: editPrompt }
  );
  return response.data;
};

/**
 * Confirm parsed matches and create them in the database
 * @param {number} leagueId - League ID
 * @param {string} sessionId - Photo session ID
 * @param {number} seasonId - Season to create matches in
 * @param {string} matchDate - Date for the matches (YYYY-MM-DD)
 */
export const confirmPhotoMatches = async (leagueId: number, sessionId: string, seasonId: number, matchDate: string, playerOverrides: Record<string, any>[] | null = null) => {
  const body: Record<string, any> = { season_id: seasonId, match_date: matchDate };
  if (playerOverrides?.length) {
    body.player_overrides = playerOverrides;
  }
  const response = await api.post(
    `/api/leagues/${leagueId}/matches/photo-sessions/${sessionId}/confirm`,
    body
  );
  return response.data;
};

/**
 * Cancel photo session and cleanup
 * @param {number} leagueId - League ID
 * @param {string} sessionId - Photo session ID
 */
export const cancelPhotoSession = async (leagueId: number, sessionId: string) => {
  const response = await api.delete(
    `/api/leagues/${leagueId}/matches/photo-sessions/${sessionId}`
  );
  return response.data;
};
