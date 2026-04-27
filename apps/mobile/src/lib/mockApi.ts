/**
 * Mock API methods for endpoints that don't yet exist on the backend.
 *
 * Each GET returns a Promise resolving to mock data shaped like the real
 * shared types. Mutations throw `Error('TODO(backend): <endpoint>')` so UI
 * can still render form submission errors without silently pretending a
 * write succeeded.
 *
 * When the backend lands, delete the matching entry from `mockApi` and the
 * real method in `@beach-kings/api-client` will take over — the Proxy in
 * `api.ts` prefers real methods over mocks.
 */

import type {
  Court,
  JoinRequest,
  KobTournament,
  KobTournamentDetail,
  KobMatch,
  KobStanding,
  LeagueSeason,
  SessionDetail,
  SessionType,
} from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// League mock shapes
// NOTE: These types represent the shape returned by future backend endpoints.
// ---------------------------------------------------------------------------

export type LeagueAccessType = 'open' | 'invite_only';
export type LeagueMemberRole = 'admin' | 'member' | 'visitor';
export type LeagueInviteStatus = 'pending' | 'accepted' | 'declined';
export type LeagueEventStatus = 'upcoming' | 'in_progress' | 'completed';

/** Full detail for a single league (header + metadata). */
// LeagueDetail promoted to '@beach-kings/shared' (see types/league.ts).
// Use api.getLeague(id) from packages/api-client/src/methods.ts.

// LeagueStanding, LeagueSeasonInfo, LeagueStandingsResponse promoted to '@beach-kings/shared'.

// LeagueChatMessage type promoted to '@beach-kings/shared' (see types/league.ts).
// Real api-client methods getLeagueMessages/createLeagueMessage already back this
// resource, so the type lives with the contract, not in this transitional module.

/** An upcoming event in the sign-ups tab. */
export interface LeagueEvent {
  readonly id: number;
  readonly title: string;
  readonly date: string;
  readonly month_abbr: string;
  readonly day: number;
  readonly time_label: string;
  readonly spots_total: number | null;
  readonly spots_remaining: number | null;
  readonly court_name: string | null;
  readonly status: LeagueEventStatus;
  /** 'signed_up' | 'waitlisted' | 'none' */
  readonly user_status: 'signed_up' | 'waitlisted' | 'none';
  readonly attendee_count: number;
}

/** Weekly schedule row in the sign-ups tab. */
export interface LeagueScheduleRow {
  readonly day_of_week: string;
  readonly time_label: string;
  readonly court_name: string | null;
}

/** A player row in the league info tab. */
export interface LeagueMemberRow {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly role: LeagueMemberRole;
  readonly joined_at: string;
}

// LeagueJoinRequest reconciled with shared `JoinRequest` (packages/shared/src/types/league.ts).
// Same entity, same status enum ('pending' | 'approved' | 'rejected'); shared type now
// includes the optional `initials` and `message` presentation fields.

/** Full info tab payload. */
export interface LeagueInfoDetail {
  readonly id: number;
  readonly description: string | null;
  readonly access_type: LeagueAccessType;
  readonly level: string | null;
  readonly location_name: string | null;
  readonly home_court_name: string | null;
  readonly members: readonly LeagueMemberRow[];
  readonly seasons: readonly LeagueSeason[];
  readonly join_requests: readonly JoinRequest[];
}

/** A pending invite item (pending-invites screen). */
export interface LeagueInviteItem {
  readonly id: number;
  readonly league_id: number;
  readonly league_name: string;
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly invited_at: string;
  readonly status: LeagueInviteStatus;
}

/** A player that can be invited (invite screen). */
export interface InvitablePlayer {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly location_name: string | null;
  readonly level: string | null;
  /** 'none' | 'member' | 'invited' | 'requested' */
  readonly invite_status: 'none' | 'member' | 'invited' | 'requested';
  /** section grouping: 'friends' | 'recent_opponents' | 'suggested' */
  readonly section: 'friends' | 'recent_opponents' | 'suggested';
}

/** Player stats in context of a specific league (from standings row tap). */
export interface LeaguePlayerStats {
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly level: string | null;
  readonly location_name: string | null;
  readonly league_id: number;
  readonly league_name: string;
  readonly season_id: number;
  readonly season_name: string;
  readonly rank: number | null;
  readonly rating: number;
  readonly rating_delta: number | null;
  readonly points: number | null;
  readonly overall: {
    readonly wins: number;
    readonly losses: number;
    readonly win_rate: number;
    readonly games_played: number;
    readonly point_diff: number;
  };
  readonly partners: readonly {
    readonly player_id: number;
    readonly display_name: string;
    readonly initials: string;
    readonly games_played: number;
    readonly wins: number;
    readonly losses: number;
    readonly win_rate: number;
  }[];
  readonly opponents: readonly {
    readonly player_id: number;
    readonly display_name: string;
    readonly initials: string;
    readonly games_played: number;
    readonly wins: number;
    readonly losses: number;
    readonly win_rate: number;
  }[];
  readonly game_history: readonly import('@beach-kings/shared').GameHistoryEntry[];
  readonly is_self: boolean;
}

// SessionStatus, SessionPlayer, SessionGame, SessionDetail promoted to
// @beach-kings/shared (P2.8). Import from there:
//   import type { SessionDetail, SessionPlayer, SessionGame } from '@beach-kings/shared';

// SessionSummary type removed — its only consumer was the dead MOCK_SESSIONS
// constant. The real `getSessions` method in packages/api-client/src/methods.ts
// returns the canonical session shape.

// GameHistoryEntry type removed — import from '@beach-kings/shared' instead:
//   import type { GameHistoryEntry } from '@beach-kings/shared';

// MyStatsPayload, PlayerStats, PartnerOpponentRow, LeagueTrophy types removed.
// Import these from '@beach-kings/shared' instead:
//   import type { MyStatsPayload, MyStatsRelationStat, MyStatsTrophy } from '@beach-kings/shared';

const notImplemented = (endpoint: string): never => {
  throw new Error(`TODO(backend): ${endpoint}`);
};

// ---------------------------------------------------------------------------
// League mock data
// ---------------------------------------------------------------------------

const MOCK_PENDING_INVITES: LeagueInviteItem[] = [
  { id: 1, league_id: 1, league_name: 'QBK Open Men', player_id: 50, display_name: 'D. Thompson', initials: 'DT', invited_at: '2026-03-15', status: 'pending' },
  { id: 2, league_id: 1, league_name: 'QBK Open Men', player_id: 51, display_name: 'R. Martinez', initials: 'RM', invited_at: '2026-03-16', status: 'accepted' },
  { id: 3, league_id: 1, league_name: 'QBK Open Men', player_id: 52, display_name: 'G. Chen', initials: 'GC', invited_at: '2026-03-17', status: 'pending' },
];

const MOCK_INVITABLE_PLAYERS: InvitablePlayer[] = [
  { player_id: 60, display_name: 'Jake Donovan', initials: 'JD', location_name: 'Queens, NY', level: 'Open', invite_status: 'none', section: 'friends' },
  { player_id: 61, display_name: 'Marco Salvatore', initials: 'MS', location_name: 'Brooklyn, NY', level: 'AA', invite_status: 'invited', section: 'friends' },
  { player_id: 62, display_name: 'Sam Joustra', initials: 'SJ', location_name: 'Manhattan, NY', level: 'Open', invite_status: 'none', section: 'recent_opponents' },
  { player_id: 63, display_name: 'Rafael Torres', initials: 'RT', location_name: 'Queens, NY', level: 'A', invite_status: 'requested', section: 'recent_opponents' },
  { player_id: 64, display_name: 'Brian Nguyen', initials: 'BN', location_name: 'Queens, NY', level: 'AA', invite_status: 'member', section: 'suggested' },
  { player_id: 65, display_name: 'Derek Park', initials: 'DP', location_name: 'Queens, NY', level: 'Open', invite_status: 'none', section: 'suggested' },
];

const MOCK_LEAGUE_PLAYER_STATS = (leagueId: number, playerId: number): LeaguePlayerStats => ({
  player_id: playerId,
  display_name: playerId === 1 ? 'P. Schwagler' : 'C. Gulla',
  initials: playerId === 1 ? 'PS' : 'CG',
  level: 'Open',
  location_name: 'Queens, NY',
  league_id: leagueId,
  league_name: 'QBK Open Men',
  season_id: 4,
  season_name: 'Season 4',
  rank: playerId === 1 ? 3 : 1,
  rating: playerId === 1 ? 1438 : 1520,
  rating_delta: playerId === 1 ? -4 : 12,
  points: null,
  overall: {
    wins: playerId === 1 ? 14 : 18,
    losses: playerId === 1 ? 6 : 2,
    win_rate: playerId === 1 ? 70 : 90,
    games_played: 20,
    point_diff: playerId === 1 ? 2.7 : 4.1,
  },
  partners: [
    { player_id: 11, display_name: 'K. Fawwar', initials: 'KF', games_played: 10, wins: 8, losses: 2, win_rate: 80 },
    { player_id: 12, display_name: 'A. Marthey', initials: 'AM', games_played: 6, wins: 4, losses: 2, win_rate: 67 },
  ],
  opponents: [
    { player_id: 14, display_name: 'J. Drabos', initials: 'JD', games_played: 6, wins: 5, losses: 1, win_rate: 83 },
    { player_id: 15, display_name: 'M. Salizar', initials: 'MS', games_played: 4, wins: 3, losses: 1, win_rate: 75 },
  ],
  game_history: [],
  is_self: playerId === 1,
});

// Session mock data removed — SessionDetail is now a real backend response.
// See packages/api-client/src/methods.ts :: getSessionById().

// ---------------------------------------------------------------------------
// Tournaments (top-level, distinct from league/session tournaments)
// ---------------------------------------------------------------------------

const MOCK_TOURNAMENTS: KobTournament[] = [
  {
    id: 1,
    name: 'Spring King of the Beach',
    code: 'SPRING24',
    gender: 'coed',
    format: 'POOLS_PLAYOFFS',
    status: 'ACTIVE',
    num_courts: 4,
    game_to: 21,
    scheduled_date: '2026-05-04',
    player_count: 16,
    current_round: 2,
    created_at: '2026-04-01T12:00:00Z',
  },
  {
    id: 2,
    name: 'Summer Slam',
    code: 'SUMMER24',
    gender: 'mens',
    format: 'FULL_ROUND_ROBIN',
    status: 'SETUP',
    num_courts: 3,
    game_to: 25,
    scheduled_date: '2026-07-12',
    player_count: 12,
    current_round: null,
    created_at: '2026-04-10T12:00:00Z',
  },
];

const MOCK_TOURNAMENT_DETAIL = (id: number): KobTournamentDetail => {
  const base =
    MOCK_TOURNAMENTS.find((t) => t.id === id) ?? MOCK_TOURNAMENTS[0];
  return {
    ...base,
    win_by: 2,
    max_rounds: 8,
    has_playoffs: true,
    playoff_size: 4,
    num_pools: 2,
    games_per_match: 1,
    num_rr_cycles: 1,
    score_cap: 25,
    playoff_format: 'single_elim',
    playoff_game_to: 21,
    playoff_games_per_match: 1,
    playoff_score_cap: 25,
    is_ranked: true,
    current_phase: 'pool_play',
    auto_advance: true,
    director_player_id: null,
    director_name: 'Tournament Director',
    league_id: null,
    location_id: null,
    schedule_data: null,
    players: [],
    matches: MOCK_KOB_LIVE_MATCHES,
    standings: MOCK_KOB_STANDINGS,
    updated_at: new Date().toISOString(),
  };
};

// ---------------------------------------------------------------------------
// Courts list mock data
// ---------------------------------------------------------------------------

const MOCK_COURTS: Court[] = [
  {
    id: 1,
    name: 'Manhattan Beach Courts',
    slug: 'manhattan-beach',
    surface_type: 'sand',
    city: 'Manhattan Beach',
    state: 'CA',
    address: '1 Manhattan Beach Blvd',
    latitude: 33.8847,
    longitude: -118.4109,
    average_rating: 4.6,
    review_count: 42,
    court_count: 8,
    photo_count: 12,
    is_free: true,
    has_lights: false,
    has_restrooms: true,
    has_parking: true,
    nets_provided: false,
    hours: 'Dawn to dusk',
    description: 'Iconic South Bay volleyball destination with well-maintained courts.',
    is_active: true,
    distance_miles: 0.3,
    top_tags: ['popular', 'well-maintained', 'ocean-view'],
  },
  {
    id: 2,
    name: "Hunter's Point South Park",
    slug: 'hunters-point',
    surface_type: 'sand',
    city: 'Long Island City',
    state: 'NY',
    address: '1 Center Blvd, Long Island City, NY',
    latitude: 40.7282,
    longitude: -73.9578,
    average_rating: 4.2,
    review_count: 18,
    court_count: 4,
    photo_count: 6,
    is_free: true,
    has_lights: false,
    has_restrooms: true,
    has_parking: false,
    nets_provided: true,
    hours: '6AM - 10PM',
    description: 'Waterfront courts with a stunning view of the Manhattan skyline.',
    is_active: true,
    distance_miles: 1.2,
    top_tags: ['waterfront', 'free'],
  },
  {
    id: 3,
    name: 'QBK Sports',
    slug: 'qbk-sports',
    surface_type: 'sand',
    city: 'Queens',
    state: 'NY',
    address: '123 Beach Blvd, Queens, NY 11101',
    latitude: 40.7128,
    longitude: -73.9760,
    average_rating: 4.8,
    review_count: 23,
    court_count: 6,
    photo_count: 7,
    is_free: false,
    has_lights: true,
    has_restrooms: true,
    has_parking: true,
    nets_provided: true,
    hours: '6AM - 10PM',
    description: 'Premium lighted sand courts, ideal for evening play.',
    is_active: true,
    distance_miles: 2.1,
    top_tags: ['lighted', 'premium', 'indoor'],
  },
];

// ---------------------------------------------------------------------------
// KoB live matches / schedule mock data
// ---------------------------------------------------------------------------

const MOCK_KOB_LIVE_MATCHES: KobMatch[] = [
  {
    id: 201,
    matchup_id: 'r3-ct1',
    round_num: 3,
    phase: 'pool_play',
    pool_id: null,
    court_num: 1,
    team1_player1_id: 1,
    team1_player2_id: 2,
    team2_player1_id: 3,
    team2_player2_id: 4,
    team1_player1_name: 'Patrick S.',
    team1_player2_name: 'Ken F.',
    team2_player1_name: 'Colan G.',
    team2_player2_name: 'Alex M.',
    team1_score: null,
    team2_score: null,
    winner: null,
    game_scores: null,
    bracket_position: null,
    is_bye: false,
  },
  {
    id: 202,
    matchup_id: 'r3-ct2',
    round_num: 3,
    phase: 'pool_play',
    pool_id: null,
    court_num: 2,
    team1_player1_id: 5,
    team1_player2_id: 6,
    team2_player1_id: 7,
    team2_player2_id: 8,
    team1_player1_name: 'Jake D.',
    team1_player2_name: 'Marco S.',
    team2_player1_name: 'Sam J.',
    team2_player2_name: 'Rafael T.',
    team1_score: null,
    team2_score: null,
    winner: null,
    game_scores: null,
    bracket_position: null,
    is_bye: false,
  },
  {
    id: 199,
    matchup_id: 'r3-ct1-earlier',
    round_num: 3,
    phase: 'pool_play',
    pool_id: null,
    court_num: 1,
    team1_player1_id: 9,
    team1_player2_id: 10,
    team2_player1_id: 11,
    team2_player2_id: 12,
    team1_player1_name: 'Dan B.',
    team1_player2_name: 'Mike R.',
    team2_player1_name: 'Rob P.',
    team2_player2_name: 'Joey T.',
    team1_score: 21,
    team2_score: 17,
    winner: 1,
    game_scores: null,
    bracket_position: null,
    is_bye: false,
  },
];

const MOCK_KOB_SCHEDULE_ROUNDS: Array<{
  round_num: number;
  status: 'complete' | 'in_progress' | 'upcoming';
  matches: KobMatch[];
}> = [
  {
    round_num: 1,
    status: 'complete',
    matches: [
      {
        id: 101,
        matchup_id: 'r1-ct1',
        round_num: 1,
        phase: 'pool_play',
        pool_id: null,
        court_num: 1,
        team1_player1_id: 1,
        team1_player2_id: 3,
        team2_player1_id: 7,
        team2_player2_id: 8,
        team1_player1_name: 'Patrick S.',
        team1_player2_name: 'Colan G.',
        team2_player1_name: 'Sam J.',
        team2_player2_name: 'Rafael T.',
        team1_score: 21,
        team2_score: 14,
        winner: 1,
        game_scores: null,
        bracket_position: null,
        is_bye: false,
      },
      {
        id: 102,
        matchup_id: 'r1-ct2',
        round_num: 1,
        phase: 'pool_play',
        pool_id: null,
        court_num: 2,
        team1_player1_id: 2,
        team1_player2_id: 4,
        team2_player1_id: 5,
        team2_player2_id: 6,
        team1_player1_name: 'Ken F.',
        team1_player2_name: 'Alex M.',
        team2_player1_name: 'Jake D.',
        team2_player2_name: 'Marco S.',
        team1_score: 21,
        team2_score: 18,
        winner: 1,
        game_scores: null,
        bracket_position: null,
        is_bye: false,
      },
    ],
  },
  {
    round_num: 2,
    status: 'complete',
    matches: [
      {
        id: 151,
        matchup_id: 'r2-ct1',
        round_num: 2,
        phase: 'pool_play',
        pool_id: null,
        court_num: 1,
        team1_player1_id: 1,
        team1_player2_id: 2,
        team2_player1_id: 6,
        team2_player2_id: 7,
        team1_player1_name: 'Patrick S.',
        team1_player2_name: 'Ken F.',
        team2_player1_name: 'Marco S.',
        team2_player2_name: 'Sam J.',
        team1_score: 21,
        team2_score: 12,
        winner: 1,
        game_scores: null,
        bracket_position: null,
        is_bye: false,
      },
    ],
  },
  {
    round_num: 3,
    status: 'in_progress',
    matches: MOCK_KOB_LIVE_MATCHES,
  },
  {
    round_num: 4,
    status: 'upcoming',
    matches: [],
  },
  {
    round_num: 5,
    status: 'upcoming',
    matches: [],
  },
];

const MOCK_KOB_STANDINGS: KobStanding[] = [
  { player_id: 1, player_name: 'Patrick S.', player_avatar: null, rank: 1, wins: 4, losses: 0, points_for: 84, points_against: 51, point_diff: 33, pool_id: null },
  { player_id: 2, player_name: 'Ken F.', player_avatar: null, rank: 2, wins: 3, losses: 1, points_for: 78, points_against: 59, point_diff: 19, pool_id: null },
  { player_id: 3, player_name: 'Colan G.', player_avatar: null, rank: 3, wins: 3, losses: 1, points_for: 75, points_against: 62, point_diff: 13, pool_id: null },
  { player_id: 4, player_name: 'Alex M.', player_avatar: null, rank: 4, wins: 2, losses: 2, points_for: 70, points_against: 68, point_diff: 2, pool_id: null },
  { player_id: 5, player_name: 'Jake D.', player_avatar: null, rank: 5, wins: 2, losses: 2, points_for: 65, points_against: 71, point_diff: -6, pool_id: null },
  { player_id: 6, player_name: 'Marco S.', player_avatar: null, rank: 6, wins: 1, losses: 3, points_for: 58, points_against: 74, point_diff: -16, pool_id: null },
  { player_id: 7, player_name: 'Sam J.', player_avatar: null, rank: 7, wins: 1, losses: 3, points_for: 55, points_against: 76, point_diff: -21, pool_id: null },
  { player_id: 8, player_name: 'Rafael T.', player_avatar: null, rank: 8, wins: 0, losses: 4, points_for: 47, points_against: 84, point_diff: -37, pool_id: null },
];

// ---------------------------------------------------------------------------
// Push notification preferences
// ---------------------------------------------------------------------------

export interface PushNotificationPrefs {
  direct_messages: boolean;
  league_messages: boolean;
  friend_requests: boolean;
  match_invites: boolean;
  session_updates: boolean;
  tournament_updates: boolean;
}

const DEFAULT_PUSH_PREFS: PushNotificationPrefs = {
  direct_messages: true,
  league_messages: true,
  friend_requests: true,
  match_invites: true,
  session_updates: true,
  tournament_updates: false,
};

// MOCK_GAMES removed — getMyGames is now a real backend call via api-client.
// MOCK_STATS removed — getMyStats is now a real backend call via api-client.
// See packages/api-client/src/methods.ts :: getMyStats().

export const mockApi = {
  // ---- Tournaments ----
  async listTournaments(): Promise<KobTournament[]> {
    return Promise.resolve(MOCK_TOURNAMENTS);
  },

  async getTournament(idOrCode: number | string): Promise<KobTournamentDetail> {
    const id = typeof idOrCode === 'number' ? idOrCode : 1;
    return Promise.resolve(MOCK_TOURNAMENT_DETAIL(id));
  },

  async createTournament(_data: Partial<KobTournament>): Promise<KobTournament> {
    return notImplemented('POST /api/tournaments');
  },

  async updateTournament(
    _id: number,
    _data: Partial<KobTournament>,
  ): Promise<KobTournament> {
    return notImplemented('PUT /api/tournaments/:id');
  },

  async deleteTournament(_id: number): Promise<void> {
    return notImplemented('DELETE /api/tournaments/:id');
  },

  // ---- Court photos (getCourtPhotos + uploadCourtPhoto are real now) ----

  async deleteCourtPhoto(
    _idOrSlug: number | string,
    _photoId: number,
  ): Promise<void> {
    return notImplemented('DELETE /api/courts/:id/photos/:photoId');
  },

  // ---- Courts list — falls back from real getCourts when backend absent ----
  // TODO(backend): GET /api/public/courts is already in api-client; this mock
  // provides test-time data when the real endpoint is unavailable.
  async getCourts(params?: {
    location_id?: string | null;
    lat?: number;
    lon?: number;
    radius?: number;
  }): Promise<Court[]> {
    if (params?.location_id != null) {
      return Promise.resolve(
        MOCK_COURTS.filter((c) => c.location_id === params.location_id),
      );
    }
    return Promise.resolve(MOCK_COURTS);
  },

  // ---- KoB derived views — TODO(backend): separate endpoints per tab ----

  /**
   * Returns schedule rounds for a tournament.
   * TODO(backend): GET /api/tournaments/:code/schedule
   */
  async getKobSchedule(
    _code: string,
  ): Promise<typeof MOCK_KOB_SCHEDULE_ROUNDS> {
    return Promise.resolve(MOCK_KOB_SCHEDULE_ROUNDS);
  },

  /**
   * Returns standings for a tournament.
   * TODO(backend): GET /api/tournaments/:code/standings
   */
  async getKobStandings(_code: string): Promise<KobStanding[]> {
    return Promise.resolve(MOCK_KOB_STANDINGS);
  },

  // ---- Push notification preferences ----
  async getPushNotificationPrefs(): Promise<PushNotificationPrefs> {
    return Promise.resolve({ ...DEFAULT_PUSH_PREFS });
  },

  async updatePushNotificationPrefs(
    _prefs: Partial<PushNotificationPrefs>,
  ): Promise<PushNotificationPrefs> {
    return notImplemented('PUT /api/users/me/push-prefs');
  },

  // ---- Sessions — TODO(backend): session endpoints ----

  // getSessions removed — real `getSessions` exists in packages/api-client/src/methods.ts.
  // getSessionById removed — now a real backend call returning SessionDetail.
  // getSessionDetailMock removed — P2.8 wired getSessionById to the enriched endpoint.
  // See packages/api-client/src/methods.ts :: getSessionById().

  // addSessionPlayer, removeSessionPlayer removed — now real backend calls.
  // See packages/api-client/src/methods.ts :: inviteSessionPlayer(),
  // removeSessionPlayer().

  /**
   * Creates a new session.
   * TODO(backend): POST /api/sessions (extended)
   */
  async createSession(_data: {
    date: string;
    start_time?: string | null;
    court_name?: string | null;
    session_type: SessionType;
    max_players?: number | null;
    notes?: string | null;
    league_id?: number | null;
  }): Promise<SessionDetail> {
    return notImplemented('POST /api/sessions (create)');
  },

  /**
   * Updates session details.
   * TODO(backend): PUT /api/sessions/:id
   */
  async updateSession(
    _id: number,
    _data: Partial<{
      date: string;
      start_time: string | null;
      court_name: string | null;
      session_type: SessionType;
      max_players: number | null;
      notes: string | null;
    }>,
  ): Promise<SessionDetail> {
    return notImplemented('PUT /api/sessions/:id');
  },

  // ---- League detail ----

  // getLeagueDetail removed — real api.getLeague(id) exists in packages/api-client/src/methods.ts.
  // getLeagueStandings removed — real api.getLeagueStandings exists in packages/api-client/src/methods.ts.
  // getLeagueSeasonsList removed — real api.getLeagueSeasons exists in packages/api-client/src/methods.ts.

  // getLeagueChat / sendLeagueMessage removed — real getLeagueMessages /
  // createLeagueMessage exist in packages/api-client/src/methods.ts.

  // getLeagueEvents / signUpForEvent / dropFromEvent removed — real
  // getLeagueSignups / joinSignup / dropSignup exist in
  // packages/api-client/src/methods.ts.

  /**
   * Leave a league.
   * TODO(backend): DELETE /api/leagues/:id/members/me
   */
  async leaveLeagueMock(_id: number | string): Promise<void> {
    return notImplemented('DELETE /api/leagues/:id/members/me');
  },

  /**
   * Returns the list of pending invites for a league (admin view).
   * TODO(backend): GET /api/leagues/:id/invites
   */
  async getLeagueInvites(_id: number | string): Promise<LeagueInviteItem[]> {
    return Promise.resolve([...MOCK_PENDING_INVITES]);
  },

  /**
   * Returns players that can be invited to a league.
   * TODO(backend): GET /api/leagues/:id/invitable-players?q=
   */
  async getInvitablePlayers(
    _id: number | string,
    _query?: string,
  ): Promise<InvitablePlayer[]> {
    return Promise.resolve([...MOCK_INVITABLE_PLAYERS]);
  },

  /**
   * Send invites to selected players.
   * TODO(backend): POST /api/leagues/:id/invites
   */
  async sendLeagueInvites(
    _id: number | string,
    _playerIds: number[],
  ): Promise<void> {
    return notImplemented('POST /api/leagues/:id/invites');
  },

  /**
   * Returns player stats within a specific league context.
   * TODO(backend): GET /api/leagues/:leagueId/players/:playerId/stats?season_id=
   */
  async getLeaguePlayerStats(
    leagueId: number | string,
    playerId: number | string,
    _seasonId?: number | null,
  ): Promise<LeaguePlayerStats> {
    return Promise.resolve(
      MOCK_LEAGUE_PLAYER_STATS(Number(leagueId), Number(playerId)),
    );
  },

  /**
   * Returns pending invites sent by the current user across all leagues.
   * TODO(backend): GET /api/users/me/league-invites/sent
   */
  async getPendingInvites(): Promise<LeagueInviteItem[]> {
    return Promise.resolve([...MOCK_PENDING_INVITES]);
  },
} as const;

export type MockApi = typeof mockApi;
