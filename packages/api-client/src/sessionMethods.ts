import type { AxiosInstance } from 'axios';
import type {
  League,
  Session,
  SessionCreatePayload,
  SessionUpdatePayload,
  SessionParticipant,
  SessionDetail,
  SessionSubmitResponse,
  SessionDeleteResponse,
  SessionBatchInviteResponse,
} from '@beach-kings/shared';

/** API methods for the Session domain. */
export function createSessionMethods(api: AxiosInstance) {
  return {

    // -----------------------------------------------------------------------
    // Session
    // -----------------------------------------------------------------------

    async getSessions() {
      const response = await api.get<Session[]>('/api/sessions/open');
      return response.data;
    },

    async getActiveSession(): Promise<Session | null> {
      const response = await api.get<Session[]>('/api/sessions/open');
      return response.data?.[0] ?? null;
    },

    /**
     * Create (or get-or-create) a session.
     *
     * Backend returns `{ status, message, session }` — we unwrap to the
     * inner session so callers can read `.id` directly. League payloads
     * (with `league_id`) hit the idempotent get-or-create path.
     */
    async createSession(payload?: SessionCreatePayload | null): Promise<Session | null> {
      const response = await api.post<{ status: string; message: string; session: Session }>(
        '/api/sessions',
        payload ?? {},
      );
      return response.data?.session ?? null;
    },

    async updateSession(
      sessionId: number,
      payload: SessionUpdatePayload,
    ): Promise<{ status: string; message: string; session: Session }> {
      const response = await api.patch<{ status: string; message: string; session: Session }>(
        `/api/sessions/${sessionId}`,
        payload,
      );
      return response.data;
    },

    async lockInSession(sessionId: number): Promise<SessionSubmitResponse> {
      const response = await api.patch<SessionSubmitResponse>(`/api/sessions/${sessionId}`, { submit: true });
      return response.data;
    },

    async lockInLeagueSession(leagueId: number, sessionId: number) {
      const response = await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { submit: true });
      return response.data;
    },

    async deleteSession(sessionId: number): Promise<SessionDeleteResponse> {
      const response = await api.delete<SessionDeleteResponse>(`/api/sessions/${sessionId}`);
      return response.data;
    },

    /**
     * Fetch the roster for a session (participants + players with matches).
     * Used by the score-entry screen's roster picker when a session is active.
     *
     * Maps to GET /api/sessions/:id/participants.
     */
    async getSessionParticipants(sessionId: number): Promise<SessionParticipant[]> {
      const response = await api.get<SessionParticipant[]>(
        `/api/sessions/${sessionId}/participants`,
      );
      return response.data;
    },

    /**
     * Fetch full session detail including roster, games, and user stats.
     *
     * The backend normalises status to uppercase ('ACTIVE', 'SUBMITTED').
     * The client normalises to lowercase to match the SessionDetail type and
     * existing screen-component comparisons.
     *
     * Maps to GET /api/sessions/:id.
     */
    async getSessionById(sessionId: number): Promise<SessionDetail> {
      const response = await api.get<SessionDetail>(`/api/sessions/${sessionId}`);
      const raw = response.data;
      const normalized = (raw.status ?? '').toString().toLowerCase();
      const status: SessionDetail['status'] =
        normalized === 'active' ? 'active' : 'submitted';
      return { ...raw, status };
    },

    /**
     * Remove a player from a session roster.
     * `playerId` is the player_id of the participant to remove.
     *
     * Maps to DELETE /api/sessions/:id/participants/:player_id.
     */
    async removeSessionPlayer(sessionId: number, playerId: number): Promise<void> {
      await api.delete(`/api/sessions/${sessionId}/participants/${playerId}`);
    },

    /**
     * Invite a player to join a session.
     * `playerId` is the player_id of the player to invite.
     *
     * Maps to POST /api/sessions/:id/invite.
     */
    async inviteSessionPlayer(
      sessionId: number,
      playerId: number,
    ): Promise<{ status: string; message: string }> {
      const response = await api.post<{ status: string; message: string }>(
        `/api/sessions/${sessionId}/invite`,
        { player_id: playerId },
      );
      return response.data;
    },

    /**
     * Idempotently attach a set of players to an active session.
     * The response reports per-player failures so callers can retry safely.
     */
    async inviteSessionPlayers(
      sessionId: number,
      playerIds: readonly number[],
    ): Promise<SessionBatchInviteResponse> {
      const response = await api.post<SessionBatchInviteResponse>(
        `/api/sessions/${sessionId}/invite_batch`,
        { player_ids: playerIds },
      );
      return response.data;
    },
  };
}
