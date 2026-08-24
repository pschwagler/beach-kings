import type { AxiosInstance } from 'axios';
import type {
  PlayerHomeCourt,
  Location,
  Court,
  CourtPhoto,
  CourtCheckIn,
  CourtCheckInsResponse,
  ReviewActionResponse,
  CreateCourtReviewInput,
  UpdateCourtReviewInput,
  SuggestCourtEditInput,
  CourtEditSuggestionReceipt,
} from '@beach-kings/shared';

const WIND_EXPOSURES = new Set(['sheltered', 'mixed', 'exposed']);
const SAND_DEPTHS = new Set(['shallow', 'typical', 'deep']);

function normalizeCourt(court: Court): Court {
  const normalized = { ...court };
  if ('wind_exposure' in court) {
    normalized.wind_exposure = WIND_EXPOSURES.has(String(court.wind_exposure))
      ? court.wind_exposure
      : null;
  }
  if ('wind_notes' in court) {
    normalized.wind_notes = typeof court.wind_notes === 'string' ? court.wind_notes : null;
  }
  if ('sand_depth' in court) {
    normalized.sand_depth = SAND_DEPTHS.has(String(court.sand_depth))
      ? court.sand_depth
      : null;
  }
  if ('sand_notes' in court) {
    normalized.sand_notes = typeof court.sand_notes === 'string' ? court.sand_notes : null;
  }
  if ('website' in court) {
    normalized.website = typeof court.website === 'string' ? court.website : null;
  }
  return normalized;
}

function validateSuggestion(input: SuggestCourtEditInput): SuggestCourtEditInput {
  const hasLatitude = Object.prototype.hasOwnProperty.call(input.changes, 'latitude');
  const hasLongitude = Object.prototype.hasOwnProperty.call(input.changes, 'longitude');
  if (hasLatitude !== hasLongitude) {
    throw new Error('Latitude and longitude must be suggested together.');
  }
  if ((input.changes.wind_notes?.length ?? 0) > 140) {
    throw new Error('Wind notes must be 140 characters or fewer.');
  }
  if ((input.changes.sand_notes?.length ?? 0) > 140) {
    throw new Error('Sand notes must be 140 characters or fewer.');
  }
  if ((input.note?.length ?? 0) > 280) {
    throw new Error('Suggestion note must be 280 characters or fewer.');
  }
  return input;
}

/** API methods for the Location, court, saved-court, and weekly-schedule domain. */
export function createCourtMethods(api: AxiosInstance) {
  return {

    // -----------------------------------------------------------------------
    // Location
    // -----------------------------------------------------------------------

    async getLocations() {
      const response = await api.get<Location[]>('/api/locations');
      return response.data;
    },

    async getLocationDistances(lat: number, lon: number) {
      const response = await api.get<Location[]>('/api/locations/distances', { params: { lat, lon } });
      return response.data;
    },

    async getCityAutocomplete(text: string) {
      const response = await api.get('/api/geocode/autocomplete', { params: { text } });
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Court
    // -----------------------------------------------------------------------

    /**
     * Fetch public courts. When `user_lat`/`user_lng` are provided the backend
     * sorts by haversine distance and populates `distance_miles` per court;
     * otherwise results come back alphabetically by name.
     *
     * NOTE: the param names must be `user_lat`/`user_lng` — the backend
     * `/api/public/courts` endpoint ignores any other coordinate keys, which
     * would silently fall back to alphabetical ordering.
     */
    async getCourts(params?: {
      location_id?: string | null;
      user_lat?: number;
      user_lng?: number;
      search?: string;
      /** Retrieve every page. Intended for complete picker catalogs. */
      all?: boolean;
    }) {
      type CourtPage = {
        items: Court[];
        total_count?: number;
        page?: number;
        page_size?: number;
      };

      const { all = false, ...requestParams } = params ?? {};
      const response = await api.get<CourtPage | Court[]>('/api/public/courts', {
        params: requestParams,
      });
      const data = response.data;
      if (Array.isArray(data)) return data.map(normalizeCourt);

      const courts = [...(data?.items ?? [])];
      if (!all) return courts.map(normalizeCourt);

      const totalCount = data?.total_count ?? courts.length;
      const pageSize = data?.page_size ?? courts.length;
      let page = data?.page ?? 1;

      // The public endpoint is paginated. Fetch every remaining page so local
      // pickers and filters operate on the full catalog, not only page one.
      // The total/page bounds protect against a malformed pagination envelope.
      const lastPage =
        pageSize > 0 ? Math.min(Math.ceil(totalCount / pageSize), 1_000) : page;
      while (courts.length < totalCount && page < lastPage) {
        page += 1;
        const next = await api.get<CourtPage>('/api/public/courts', {
          params: { ...requestParams, page, page_size: pageSize },
        });
        const items = next.data?.items ?? [];
        if (items.length === 0) break;
        courts.push(...items);
      }

      return courts.map(normalizeCourt);
    },

    /** Return the non-geocoded private/other court for a saved metro. */
    async getPlaceholderCourt(locationId: string): Promise<Court> {
      const response = await api.get<Court>('/api/courts/placeholder', {
        params: { location_id: locationId },
      });
      return response.data;
    },

    /**
     * Fetch a player's home courts (ordered by position), including
     * coordinates. Used as a fallback when resolving the user's location.
     *
     * Maps to GET /api/players/{playerId}/home-courts.
     */
    async getPlayerHomeCourts(playerId: number): Promise<PlayerHomeCourt[]> {
      const response = await api.get<PlayerHomeCourt[]>(
        `/api/players/${playerId}/home-courts`,
      );
      return response.data;
    },

    /** Replace and order the authenticated player's home courts atomically. */
    async setPlayerHomeCourts(
      playerId: number,
      courtIds: readonly number[],
    ): Promise<PlayerHomeCourt[]> {
      const response = await api.put<PlayerHomeCourt[]>(
        `/api/players/${playerId}/home-courts`,
        { court_ids: courtIds },
      );
      return response.data;
    },

    async suggestCourtEdit(
      courtId: number,
      input: SuggestCourtEditInput,
    ): Promise<CourtEditSuggestionReceipt> {
      const response = await api.post<CourtEditSuggestionReceipt>(
        `/api/courts/${courtId}/suggest-edit`,
        validateSuggestion(input),
      );
      return {
        id: response.data.id,
        court_id: response.data.court_id,
        status: response.data.status ?? 'pending',
        created_at: response.data.created_at ?? null,
      };
    },

    /**
     * Fetch full detail for a single court by numeric id or slug.
     * Returns 404 when the court is not found.
     */
    async getCourtById(idOrSlug: string | number): Promise<Court> {
      const response = await api.get<Court>(`/api/courts/${idOrSlug}`);
      return normalizeCourt(response.data);
    },

    /**
     * List standalone photos for a court (public — no auth required).
     * Accepts numeric id or url slug.
     */
    async getCourtPhotos(idOrSlug: string | number): Promise<CourtPhoto[]> {
      const response = await api.get<CourtPhoto[]>(
        `/api/public/courts/${idOrSlug}/photos`,
      );
      return response.data;
    },

    /**
     * Upload a standalone photo to a court (multipart form data).
     *
     * `file` accepts either a web `File` / `Blob` or the React Native shape
     * `{ uri, name, type }` produced by image pickers — both are valid
     * `FormData.append` payloads at runtime.
     */
    async uploadCourtPhoto(
      courtId: number,
      file: File | Blob | { uri: string; name: string; type: string },
      caption?: string,
    ): Promise<CourtPhoto> {
      const form = new FormData();
      // FormData accepts native-style `{ uri, name, type }` on React Native
      // even though the DOM lib types only allow Blob/File.
      form.append('file', file as unknown as Blob);
      if (caption != null && caption.trim().length > 0) {
        form.append('caption', caption.trim());
      }
      // Do NOT hardcode `Content-Type: multipart/form-data`. On React Native
      // that suppresses the auto-generated `boundary=...` parameter, so the
      // backend cannot parse the body and rejects it with a 400. Setting the
      // header to `undefined` removes the axios JSON default and lets the
      // native XHR layer set the correct multipart Content-Type (with boundary).
      const response = await api.post<CourtPhoto>(
        `/api/courts/${courtId}/photos`,
        form,
        { headers: { 'Content-Type': undefined } },
      );
      return response.data;
    },

    /**
     * Check the current player in to a court.
     *
     * Requires authentication. Check-in auto-expires after 4 hours. Returns
     * the created check-in record.
     */
    async checkInToCourt(courtId: number): Promise<CourtCheckIn> {
      const response = await api.post<CourtCheckIn>(
        `/api/courts/${courtId}/check-in`,
      );
      return response.data;
    },

    /**
     * Check the current player out of a court.
     *
     * Requires authentication. Returns confirmation that the check-in was
     * removed.
     */
    async checkOutOfCourt(
      courtId: number,
    ): Promise<{ court_id: number; checked_out: boolean }> {
      const response = await api.delete<{
        court_id: number;
        checked_out: boolean;
      }>(`/api/courts/${courtId}/check-in`);
      return response.data;
    },

    /**
     * Fetch the current active check-ins at a court (public — no auth required).
     *
     * Accepts a numeric id or url slug. Returns the count and the list of
     * players currently checked in.
     */
    async getCourtCheckIns(
      idOrSlug: string | number,
    ): Promise<CourtCheckInsResponse> {
      const response = await api.get<CourtCheckInsResponse>(
        `/api/public/courts/${idOrSlug}/check-ins`,
      );
      return response.data;
    },

    /**
     * List the curated court review tags (public — no auth required).
     *
     * Returns tags grouped by category (quality, vibe, facility), ordered by
     * sort_order.
     */
    async getCourtTags(): Promise<
      Array<{
        id: number;
        name: string;
        slug: string;
        category: string;
        sort_order: number;
      }>
    > {
      const response = await api.get<
        Array<{
          id: number;
          name: string;
          slug: string;
          category: string;
          sort_order: number;
        }>
      >('/api/public/courts/tags');
      return response.data;
    },

    /**
     * Create a review for a court (one per player per court).
     *
     * Requires authentication. Rating 1-5 is required; review_text and tag_ids
     * are optional. Returns aggregate review stats for the court.
     */
    async createCourtReview(
      courtId: number,
      input: CreateCourtReviewInput,
    ): Promise<ReviewActionResponse> {
      const response = await api.post<ReviewActionResponse>(
        `/api/courts/${courtId}/reviews`,
        input,
      );
      return response.data;
    },

    /**
     * Update an existing court review (author only).
     *
     * Requires authentication. Only supplied fields are updated. Returns
     * aggregate review stats for the court.
     */
    async updateCourtReview(
      courtId: number,
      reviewId: number,
      input: UpdateCourtReviewInput,
    ): Promise<ReviewActionResponse> {
      const response = await api.put<ReviewActionResponse>(
        `/api/courts/${courtId}/reviews/${reviewId}`,
        input,
      );
      return response.data;
    },

    /**
     * Delete a court review (author only).
     *
     * Requires authentication. Returns aggregate review stats for the court
     * after deletion.
     */
    async deleteCourtReview(
      courtId: number,
      reviewId: number,
    ): Promise<ReviewActionResponse> {
      const response = await api.delete<ReviewActionResponse>(
        `/api/courts/${courtId}/reviews/${reviewId}`,
      );
      return response.data;
    },

    // -----------------------------------------------------------------------
    // Saved courts ("My Courts")
    // -----------------------------------------------------------------------

    /**
     * Save a court to the authenticated player's "My Courts" (idempotent).
     *
     * Requires authentication. Returns the saved state for the court.
     */
    async saveCourt(courtId: number): Promise<{ court_id: number; saved: boolean }> {
      const response = await api.post<{ court_id: number; saved: boolean }>(
        '/api/users/me/courts',
        { court_id: courtId },
      );
      return response.data;
    },

    /**
     * Remove a court from the authenticated player's "My Courts" (idempotent).
     *
     * Requires authentication. Returns the (now unsaved) state for the court.
     */
    async unsaveCourt(courtId: number): Promise<{ court_id: number; saved: boolean }> {
      const response = await api.delete<{ court_id: number; saved: boolean }>(
        `/api/users/me/courts/${courtId}`,
      );
      return response.data;
    },

    /**
     * List the authenticated player's saved courts ("My Courts") as court cards.
     *
     * Requires authentication. Each card includes ``is_saved: true``.
     */
    async getMyCourts(): Promise<Court[]> {
      const response = await api.get<Court[]>('/api/users/me/courts');
      return response.data.map(normalizeCourt);
    },

    // -----------------------------------------------------------------------
    // Weekly Schedule
    // -----------------------------------------------------------------------

    async createWeeklySchedule(seasonId: number, scheduleData: Record<string, unknown>) {
      const response = await api.post(`/api/seasons/${seasonId}/weekly-schedules`, scheduleData);
      return response.data;
    },

    async getWeeklySchedules(seasonId: number) {
      const response = await api.get(`/api/seasons/${seasonId}/weekly-schedules`);
      return response.data;
    },

    async updateWeeklySchedule(scheduleId: number, scheduleData: Record<string, unknown>) {
      const response = await api.put(`/api/weekly-schedules/${scheduleId}`, scheduleData);
      return response.data;
    },

    async deleteWeeklySchedule(scheduleId: number) {
      const response = await api.delete(`/api/weekly-schedules/${scheduleId}`);
      return response.data;
    },
  };
}
