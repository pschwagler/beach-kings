/**
 * API methods for Beach Volleyball ELO backend
 */

import type { ApiClient } from './client';
import type { Player, Match, League, Season, Session, Location, Court } from '@beach-kings/shared';

export function createApiMethods(client: ApiClient) {
  const api = client.axiosInstance;

  return {
    // Auth methods
    async login(credentials: { phone?: string; email?: string; password?: string }) {
      const response = await api.post('/api/auth/login', credentials);
      return response.data;
    },

    async signup(data: { phone: string; name?: string; email?: string }) {
      const response = await api.post('/api/auth/signup', data);
      return response.data;
    },

    async logout() {
      const response = await api.post('/api/auth/logout');
      return response.data;
    },

    async sendVerification(phone: string) {
      const response = await api.post('/api/auth/send-verification', { phone });
      return response.data;
    },

    async verifyPhone(phone: string, code: string) {
      const response = await api.post('/api/auth/verify-phone', { phone, code });
      return response.data;
    },

    // Player methods
    async getPlayers() {
      const response = await api.get<Player[]>('/api/players');
      return response.data;
    },

    async createPlayer(name: string) {
      const response = await api.post<Player>('/api/players', { name });
      return response.data;
    },

    async getPlayerStats(playerId: number | string) {
      const response = await api.get(`/api/players/${encodeURIComponent(playerId)}`);
      return response.data;
    },

    async getPlayerSeasonStats(playerId: number, seasonId: number) {
      const response = await api.get(`/api/players/${playerId}/season/${seasonId}/stats`);
      return response.data;
    },

    async getPlayerMatchHistory(playerId: number | string) {
      const response = await api.get(`/api/players/${encodeURIComponent(playerId)}/matches`);
      return response.data;
    },

    async getPlayerSeasonPartnershipOpponentStats(playerId: number, seasonId: number) {
      const response = await api.get(`/api/players/${playerId}/season/${seasonId}/partnership-opponent-stats`);
      return response.data;
    },

    // Match methods
    async getMatches() {
      const response = await api.get<Match[]>('/api/matches');
      return response.data;
    },

    async queryMatches(queryParams: any) {
      const response = await api.post<Match[]>('/api/matches/search', queryParams);
      return response.data;
    },

    async createMatch(matchData: Partial<Match>) {
      const response = await api.post<Match>('/api/matches', matchData);
      return response.data;
    },

    async updateMatch(matchId: number, matchData: Partial<Match>) {
      const response = await api.put<Match>(`/api/matches/${matchId}`, matchData);
      return response.data;
    },

    async deleteMatch(matchId: number) {
      const response = await api.delete(`/api/matches/${matchId}`);
      return response.data;
    },

    async exportMatchesToCSV() {
      if (typeof window === 'undefined') {
        throw new Error('exportMatchesToCSV can only be called in the browser');
      }
      const response = await api.get('/api/matches/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'matches_export.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },

    // Ranking methods
    async getRankings(queryParams: any = {}) {
      const response = await api.post('/api/rankings', queryParams);
      return response.data;
    },

    async getEloTimeline() {
      const response = await api.get('/api/elo-timeline');
      return response.data;
    },

    // League methods
    async listLeagues() {
      const response = await api.get<League[]>('/api/leagues');
      return response.data;
    },

    async getLeague(leagueId: number) {
      const response = await api.get<League>(`/api/leagues/${leagueId}`);
      return response.data;
    },

    async createLeague(leagueData: Partial<League>) {
      const response = await api.post<League>('/api/leagues', leagueData);
      return response.data;
    },

    async updateLeague(leagueId: number, leagueData: Partial<League>) {
      const response = await api.put<League>(`/api/leagues/${leagueId}`, leagueData);
      return response.data;
    },

    async getLeagueSeasons(leagueId: number) {
      const response = await api.get<Season[]>(`/api/leagues/${leagueId}/seasons`);
      return response.data;
    },

    async getLeagueMembers(leagueId: number) {
      const response = await api.get(`/api/leagues/${leagueId}/members`);
      return response.data;
    },

    async getUserLeagues() {
      const response = await api.get<League[]>('/api/users/me/leagues');
      return response.data;
    },

    async addLeagueMember(leagueId: number, playerId: number, role = 'member') {
      const response = await api.post(`/api/leagues/${leagueId}/members`, { player_id: playerId, role });
      return response.data;
    },

    async removeLeagueMember(leagueId: number, memberId: number) {
      const response = await api.delete(`/api/leagues/${leagueId}/members/${memberId}`);
      return response.data;
    },

    async leaveLeague(leagueId: number) {
      const response = await api.post(`/api/leagues/${leagueId}/leave`);
      return response.data;
    },

    async updateLeagueMember(leagueId: number, memberId: number, role: string) {
      const response = await api.put(`/api/leagues/${leagueId}/members/${memberId}`, { role });
      return response.data;
    },

    async createLeagueSeason(leagueId: number, seasonData: Partial<Season>) {
      const response = await api.post<Season>(`/api/leagues/${leagueId}/seasons`, seasonData);
      return response.data;
    },

    async createLeagueSession(leagueId: number, sessionData: Partial<Session>) {
      const response = await api.post<Session>(`/api/leagues/${leagueId}/sessions`, sessionData);
      return response.data;
    },

    async getLeagueMessages(leagueId: number) {
      const response = await api.get(`/api/leagues/${leagueId}/messages`);
      return response.data;
    },

    async createLeagueMessage(leagueId: number, message: string) {
      const response = await api.post(`/api/leagues/${leagueId}/messages`, { message });
      return response.data;
    },

    // Season methods
    async getSeasonMatches(seasonId: number) {
      const response = await api.get<Match[]>(`/api/seasons/${seasonId}/matches`);
      return response.data;
    },

    async getAllPlayerSeasonStats(seasonId: number) {
      const response = await api.get(`/api/seasons/${seasonId}/player-stats`);
      return response.data;
    },

    async getAllSeasonPartnershipOpponentStats(seasonId: number) {
      const response = await api.get(`/api/seasons/${seasonId}/partnership-opponent-stats`);
      return response.data;
    },

    // Session methods
    async getSessions() {
      const response = await api.get<Session[]>('/api/sessions');
      return response.data;
    },

    async getActiveSession() {
      const response = await api.get<Session>('/api/sessions?active=true');
      return response.data;
    },

    async createSession(date?: string | null) {
      const response = await api.post<Session>('/api/sessions', { date });
      return response.data;
    },

    async lockInSession(sessionId: number) {
      const response = await api.patch(`/api/sessions/${sessionId}`, { submit: true });
      return response.data;
    },

    async lockInLeagueSession(leagueId: number, sessionId: number) {
      const response = await api.patch(`/api/leagues/${leagueId}/sessions/${sessionId}`, { submit: true });
      return response.data;
    },

    async deleteSession(sessionId: number) {
      const response = await api.delete(`/api/sessions/${sessionId}`);
      return response.data;
    },

    // User methods
    async getCurrentUserPlayer() {
      const response = await api.get<Player>('/api/users/me/player');
      return response.data;
    },

    async updatePlayerProfile(playerData: Partial<Player>) {
      const response = await api.put<Player>('/api/users/me/player', playerData);
      return response.data;
    },

    async updateUserProfile(userData: { name?: string; email?: string }) {
      const response = await api.put('/api/users/me', userData);
      return response.data;
    },

    // Location methods
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

    // Court methods
    async getCourts(locationId?: number | null) {
      const params = locationId ? { location_id: locationId } : {};
      const response = await api.get<Court[]>('/api/courts', { params });
      return response.data;
    },

    // Weekly Schedule methods
    async createWeeklySchedule(seasonId: number, scheduleData: any) {
      const response = await api.post(`/api/seasons/${seasonId}/weekly-schedules`, scheduleData);
      return response.data;
    },

    async getWeeklySchedules(seasonId: number) {
      const response = await api.get(`/api/seasons/${seasonId}/weekly-schedules`);
      return response.data;
    },

    async updateWeeklySchedule(scheduleId: number, scheduleData: any) {
      const response = await api.put(`/api/weekly-schedules/${scheduleId}`, scheduleData);
      return response.data;
    },

    async deleteWeeklySchedule(scheduleId: number) {
      const response = await api.delete(`/api/weekly-schedules/${scheduleId}`);
      return response.data;
    },

    // Signup methods
    async createSignup(seasonId: number, signupData: any) {
      const response = await api.post(`/api/seasons/${seasonId}/signups`, signupData);
      return response.data;
    },

    async getSignups(seasonId: number, options: { upcoming_only?: boolean; past_only?: boolean; include_players?: boolean } = {}) {
      const params = new URLSearchParams();
      if (options.upcoming_only) params.append('upcoming_only', 'true');
      if (options.past_only) params.append('past_only', 'true');
      if (options.include_players) params.append('include_players', 'true');
      const queryString = params.toString();
      const url = `/api/seasons/${seasonId}/signups${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(url);
      return response.data;
    },

    async getSignup(signupId: number) {
      const response = await api.get(`/api/signups/${signupId}`);
      return response.data;
    },

    async updateSignup(signupId: number, signupData: any) {
      const response = await api.put(`/api/signups/${signupId}`, signupData);
      return response.data;
    },

    async deleteSignup(signupId: number) {
      const response = await api.delete(`/api/signups/${signupId}`);
      return response.data;
    },

    async signupForSignup(signupId: number) {
      const response = await api.post(`/api/signups/${signupId}/signup`);
      return response.data;
    },

    async dropoutFromSignup(signupId: number) {
      const response = await api.post(`/api/signups/${signupId}/dropout`);
      return response.data;
    },

    async getSignupPlayers(signupId: number) {
      const response = await api.get(`/api/signups/${signupId}/players`);
      return response.data;
    },

    async getSignupEvents(signupId: number) {
      const response = await api.get(`/api/signups/${signupId}/events`);
      return response.data;
    },

    // Feedback methods
    async submitFeedback(feedback: string, email?: string) {
      const response = await api.post('/api/feedback', { feedback_text: feedback, email: email || undefined });
      return response.data;
    },

    // Admin methods
    async getAdminConfig() {
      const response = await api.get('/api/admin-view/config');
      return response.data;
    },

    async updateAdminConfig(config: any) {
      const response = await api.put('/api/admin-view/config', config);
      return response.data;
    },

    async getAdminFeedback() {
      const response = await api.get('/api/admin-view/feedback');
      return response.data;
    },

    async updateFeedbackResolution(feedbackId: number, isResolved: boolean) {
      const response = await api.patch(`/api/admin-view/feedback/${feedbackId}/resolve`, { is_resolved: isResolved });
      return response.data;
    },

    // Health check
    async healthCheck() {
      const response = await api.get('/api/health');
      return response.data;
    },
  };
}

export type ApiMethods = ReturnType<typeof createApiMethods>;

