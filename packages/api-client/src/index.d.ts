/**
 * TypeScript declarations for API client
 */

export interface StorageAdapter {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
}

export interface ApiClientOptions {
  onTokenRefresh?: (token: string) => void;
  onAuthError?: (error: any) => void;
}

export interface ApiClient {
  setAuthTokens: (accessToken: string, refreshToken?: string) => Promise<void>;
  clearAuthTokens: () => Promise<void>;
  getStoredTokens: () => Promise<{ accessToken: string | null; refreshToken: string | null }>;
  getRankings: (queryParams?: any) => Promise<any>;
  getPlayers: () => Promise<any>;
  createPlayer: (name: string) => Promise<any>;
  getPlayerStats: (playerName: string) => Promise<any>;
  getPlayerSeasonStats: (playerId: number | string, seasonId: number | string) => Promise<any>;
  getPlayerMatchHistory: (playerName: string) => Promise<any>;
  getPlayerSeasonPartnershipOpponentStats: (playerId: number | string, seasonId: number | string) => Promise<any>;
  getMatches: () => Promise<any>;
  queryMatches: (queryParams: any) => Promise<any>;
  createMatch: (matchData: any) => Promise<any>;
  updateMatch: (matchId: number | string, matchData: any) => Promise<any>;
  deleteMatch: (matchId: number | string) => Promise<any>;
  exportMatchesToCSV: () => Promise<void>;
  getSeasonMatches: (seasonId: number | string) => Promise<any>;
  getAllPlayerSeasonStats: (seasonId: number | string) => Promise<any>;
  getAllSeasonPartnershipOpponentStats: (seasonId: number | string) => Promise<any>;
  createLeague: (leagueData: any) => Promise<any>;
  listLeagues: () => Promise<any>;
  getLeague: (leagueId: number | string) => Promise<any>;
  updateLeague: (leagueId: number | string, leagueData: any) => Promise<any>;
  getLeagueSeasons: (leagueId: number | string) => Promise<any>;
  getLeagueMembers: (leagueId: number | string) => Promise<any>;
  getUserLeagues: () => Promise<any>;
  addLeagueMember: (leagueId: number | string, playerId: number | string, role?: string) => Promise<any>;
  removeLeagueMember: (leagueId: number | string, memberId: number | string) => Promise<any>;
  leaveLeague: (leagueId: number | string) => Promise<any>;
  updateLeagueMember: (leagueId: number | string, memberId: number | string, role: string) => Promise<any>;
  createLeagueSeason: (leagueId: number | string, seasonData: any) => Promise<any>;
  createLeagueSession: (leagueId: number | string, sessionData: any) => Promise<any>;
  lockInLeagueSession: (leagueId: number | string, sessionId: number | string) => Promise<any>;
  getLeagueMessages: (leagueId: number | string) => Promise<any>;
  createLeagueMessage: (leagueId: number | string, message: string) => Promise<any>;
  getSessions: () => Promise<any>;
  getActiveSession: () => Promise<any>;
  createSession: (date?: string | null) => Promise<any>;
  lockInSession: (sessionId: number | string) => Promise<any>;
  deleteSession: (sessionId: number | string) => Promise<any>;
  getCurrentUserPlayer: () => Promise<any>;
  updatePlayerProfile: (playerData: any) => Promise<any>;
  updateUserProfile: (userData: any) => Promise<any>;
  getLocations: () => Promise<any>;
  getLocationDistances: (lat: number, lon: number) => Promise<any>;
  getCityAutocomplete: (text: string) => Promise<any>;
  getCourts: (locationId?: number | string | null) => Promise<any>;
  createWeeklySchedule: (seasonId: number | string, scheduleData: any) => Promise<any>;
  getWeeklySchedules: (seasonId: number | string) => Promise<any>;
  updateWeeklySchedule: (scheduleId: number | string, scheduleData: any) => Promise<any>;
  deleteWeeklySchedule: (scheduleId: number | string) => Promise<any>;
  createSignup: (seasonId: number | string, signupData: any) => Promise<any>;
  getSignups: (seasonId: number | string, options?: any) => Promise<any>;
  getSignup: (signupId: number | string) => Promise<any>;
  updateSignup: (signupId: number | string, signupData: any) => Promise<any>;
  deleteSignup: (signupId: number | string) => Promise<any>;
  signupForSignup: (signupId: number | string) => Promise<any>;
  dropoutFromSignup: (signupId: number | string) => Promise<any>;
  getSignupPlayers: (signupId: number | string) => Promise<any>;
  getSignupEvents: (signupId: number | string) => Promise<any>;
  getEloTimeline: () => Promise<any>;
  login: (credentials: any) => Promise<any>;
  signup: (signupData: any) => Promise<any>;
  sendVerification: (phoneData: any) => Promise<any>;
  verifyPhone: (verifyData: any) => Promise<any>;
  smsLogin: (smsData: any) => Promise<any>;
  checkPhone: (phone: string) => Promise<any>;
  getCurrentUser: () => Promise<any>;
  resetPassword: (resetData: any) => Promise<any>;
  resetPasswordVerify: (verifyData: any) => Promise<any>;
  resetPasswordConfirm: (confirmData: any) => Promise<any>;
  logout: () => Promise<any>;
  submitFeedback: (data: { feedback: string; email?: string }) => Promise<any>;
  getAdminConfig: () => Promise<any>;
  updateAdminConfig: (config: any) => Promise<any>;
  getAdminFeedback: () => Promise<any>;
  updateFeedbackResolution: (feedbackId: number | string, isResolved: boolean) => Promise<any>;
  healthCheck: () => Promise<any>;
}

export declare function initApiClient(baseURL?: string, options?: ApiClientOptions): ApiClient;
export type { ApiClient, StorageAdapter, ApiClientOptions };
export declare function setStorageAdapter(adapter: StorageAdapter): void;
export declare function getStorageAdapter(): StorageAdapter;
export declare const webStorageAdapter: StorageAdapter;





