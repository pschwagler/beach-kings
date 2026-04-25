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
  CourtPhoto,
  KobTournament,
  KobTournamentDetail,
  KobMatch,
  KobStanding,
} from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// League mock shapes
// NOTE: These types represent the shape returned by future backend endpoints.
// ---------------------------------------------------------------------------

export type LeagueAccessType = 'open' | 'invite_only';
export type LeagueMemberRole = 'admin' | 'member' | 'visitor';
export type LeagueJoinRequestStatus = 'pending' | 'approved' | 'denied';
export type LeagueInviteStatus = 'pending' | 'accepted' | 'declined';
export type LeagueEventStatus = 'upcoming' | 'in_progress' | 'completed';

/** Full detail for a single league (header + metadata). */
export interface LeagueDetail {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly access_type: LeagueAccessType;
  readonly gender: 'mens' | 'womens' | 'coed';
  readonly level: string | null;
  readonly location_name: string | null;
  readonly home_court_name: string | null;
  readonly home_court_id: number | null;
  readonly member_count: number;
  readonly season_count: number;
  readonly current_season_id: number | null;
  readonly current_season_name: string | null;
  readonly is_active: boolean;
  readonly user_role: LeagueMemberRole;
  readonly user_rank: number | null;
  readonly user_wins: number;
  readonly user_losses: number;
  readonly user_rating: number | null;
}

/** A single row in the standings table. */
export interface LeagueStanding {
  readonly rank: number;
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly wins: number;
  readonly losses: number;
  readonly win_rate: number;
  readonly rating: number;
  readonly rating_delta: number | null;
  readonly games_played: number;
}

/** Season summary for the season picker / info tab. */
export interface LeagueSeason {
  readonly id: number;
  readonly name: string;
  readonly is_active: boolean;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly session_count: number;
  readonly game_count: number;
}

/** Season info card shown below standings. */
export interface LeagueSeasonInfo {
  readonly id: number;
  readonly name: string;
  readonly started_at: string;
  readonly session_count: number;
  readonly game_count: number;
}

/**
 * A message in the league chat.
 *
 * Field names mirror the backend response from `GET /api/leagues/:id/messages`
 * (see apps/backend/services/message_data.py). `initials` is derived
 * client-side since it's pure presentation.
 */
export interface LeagueChatMessage {
  readonly id: number;
  readonly league_id: number;
  readonly user_id: number;
  readonly player_id: number | null;
  readonly player_name: string | null;
  readonly message: string;
  readonly created_at: string | null;
  /** Server-computed: true when row.user_id == authenticated caller. */
  readonly is_mine: boolean;
  /** Client-derived from player_name (e.g. "Patrick Schwagler" -> "PS"). */
  readonly initials: string;
}

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

/** A pending join request (admin view). */
export interface LeagueJoinRequest {
  readonly id: number;
  readonly player_id: number;
  readonly display_name: string;
  readonly initials: string;
  readonly requested_at: string;
  readonly status: LeagueJoinRequestStatus;
  readonly message: string | null;
}

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
  readonly join_requests: readonly LeagueJoinRequest[];
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

/** A league card in the find-leagues search results. */
export interface FindLeagueResult {
  readonly id: number;
  readonly name: string;
  readonly gender: 'mens' | 'womens' | 'coed';
  readonly level: string | null;
  readonly access_type: LeagueAccessType;
  readonly location_name: string | null;
  readonly member_count: number;
  readonly friends_in_league: readonly { player_id: number; initials: string }[];
  /** 'none' | 'member' | 'requested' */
  readonly user_status: 'none' | 'member' | 'requested';
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
  readonly game_history: readonly GameHistoryEntry[];
  readonly is_self: boolean;
}

// ---------------------------------------------------------------------------
// Session mock shapes
// NOTE: These represent future backend endpoint responses.
// ---------------------------------------------------------------------------

export type SessionStatus = 'active' | 'submitted';
export type SessionType = 'pickup' | 'league';

/** A player entry in a session's roster. */
export interface SessionPlayer {
  readonly id: number;
  readonly player_id: number | null;
  readonly display_name: string;
  readonly initials: string;
  readonly is_placeholder: boolean;
  /** number of games played in this session */
  readonly game_count: number;
}

/** A single game/match within a session. */
export interface SessionGame {
  readonly id: number;
  readonly game_number: number;
  readonly team1_player1_name: string;
  readonly team1_player2_name: string;
  readonly team2_player1_name: string;
  readonly team2_player2_name: string;
  readonly team1_score: number | null;
  readonly team2_score: number | null;
  /** 1 = team1 won, 2 = team2 won, null = pending */
  readonly winner: 1 | 2 | null;
  /** null until submitted */
  readonly rating_change: number | null;
}

/** A full session detail (active or submitted). */
export interface SessionDetail {
  readonly id: number;
  readonly league_id: number | null;
  readonly league_name: string | null;
  readonly court_name: string | null;
  readonly date: string;
  readonly start_time: string | null;
  readonly session_number: number;
  readonly status: SessionStatus;
  readonly session_type: SessionType;
  readonly max_players: number | null;
  readonly notes: string | null;
  readonly players: readonly SessionPlayer[];
  readonly games: readonly SessionGame[];
  /** Aggregate stats for the current user within this session */
  readonly user_wins: number;
  readonly user_losses: number;
  readonly user_rating_change: number | null;
}

/** Minimal session data for list/create forms. */
export interface SessionSummary {
  readonly id: number;
  readonly date: string;
  readonly session_number: number;
  readonly status: SessionStatus;
  readonly session_type: SessionType;
  readonly player_count: number;
  readonly game_count: number;
  readonly league_name: string | null;
  readonly court_name: string | null;
}

// ---------------------------------------------------------------------------
// Games & Stats mock shapes
// NOTE: These types represent the shape returned by future backend endpoints.
// ---------------------------------------------------------------------------

/** A single game entry in the "My Games" history list. */
export interface GameHistoryEntry {
  readonly id: number;
  readonly session_id: number | null;
  readonly league_id: number | null;
  readonly league_name: string | null;
  /** ISO date string, e.g. "2026-03-19" */
  readonly date: string;
  /** Time string for display, e.g. "3:45 PM" */
  readonly time_label: string;
  /** "win" | "loss" */
  readonly result: 'win' | 'loss';
  readonly team1_score: number;
  readonly team2_score: number;
  readonly team1_player1_name: string;
  readonly team1_player2_name: string;
  readonly team2_player1_name: string;
  readonly team2_player2_name: string;
  /** Whether the current user is on team1 (true) or team2 (false). */
  readonly user_on_team1: boolean;
  /** ELO rating delta for this game; null if pending/unranked. */
  readonly rating_change: number | null;
  /** true when a placeholder player hasn't yet claimed their account */
  readonly has_pending_player: boolean;
  readonly is_ranked: boolean;
}

// MyStatsPayload, PlayerStats, PartnerOpponentRow, LeagueTrophy types removed.
// Import these from '@beach-kings/shared' instead:
//   import type { MyStatsPayload, MyStatsRelationStat, MyStatsTrophy } from '@beach-kings/shared';

const notImplemented = (endpoint: string): never => {
  throw new Error(`TODO(backend): ${endpoint}`);
};

// ---------------------------------------------------------------------------
// League mock data
// ---------------------------------------------------------------------------

const MOCK_LEAGUE_DETAIL: LeagueDetail = {
  id: 1,
  name: 'QBK Open Men',
  description: 'Competitive open-level men\'s beach volleyball league at QBK Sports.',
  access_type: 'open',
  gender: 'mens',
  level: 'Open',
  location_name: 'Queens, NY',
  home_court_name: 'QBK Sports',
  home_court_id: 3,
  member_count: 24,
  season_count: 4,
  current_season_id: 4,
  current_season_name: 'Season 4',
  is_active: true,
  user_role: 'member',
  user_rank: 3,
  user_wins: 14,
  user_losses: 6,
  user_rating: 1438,
};

const MOCK_LEAGUE_STANDINGS: LeagueStanding[] = [
  { rank: 1, player_id: 10, display_name: 'C. Gulla', initials: 'CG', wins: 18, losses: 2, win_rate: 90, rating: 1520, rating_delta: 12, games_played: 20 },
  { rank: 2, player_id: 11, display_name: 'K. Fawwar', initials: 'KF', wins: 16, losses: 4, win_rate: 80, rating: 1490, rating_delta: 8, games_played: 20 },
  { rank: 3, player_id: 1, display_name: 'P. Schwagler', initials: 'PS', wins: 14, losses: 6, win_rate: 70, rating: 1438, rating_delta: -4, games_played: 20 },
  { rank: 4, player_id: 12, display_name: 'A. Marthey', initials: 'AM', wins: 12, losses: 8, win_rate: 60, rating: 1400, rating_delta: 2, games_played: 20 },
  { rank: 5, player_id: 13, display_name: 'S. Jindash', initials: 'SJ', wins: 10, losses: 10, win_rate: 50, rating: 1368, rating_delta: -6, games_played: 20 },
  { rank: 6, player_id: 14, display_name: 'J. Drabos', initials: 'JD', wins: 8, losses: 12, win_rate: 40, rating: 1330, rating_delta: 3, games_played: 20 },
  { rank: 7, player_id: 15, display_name: 'M. Salizar', initials: 'MS', wins: 6, losses: 14, win_rate: 30, rating: 1295, rating_delta: -2, games_played: 20 },
  { rank: 8, player_id: 16, display_name: 'R. Torres', initials: 'RT', wins: 4, losses: 16, win_rate: 20, rating: 1255, rating_delta: -10, games_played: 20 },
];

const MOCK_LEAGUE_SEASONS: LeagueSeason[] = [
  { id: 4, name: 'Season 4', is_active: true, started_at: '2026-03-01', ended_at: null, session_count: 3, game_count: 36 },
  { id: 3, name: 'Season 3', is_active: false, started_at: '2025-11-01', ended_at: '2026-02-28', session_count: 10, game_count: 120 },
  { id: 2, name: 'Season 2', is_active: false, started_at: '2025-06-01', ended_at: '2025-10-31', session_count: 12, game_count: 148 },
  { id: 1, name: 'Season 1', is_active: false, started_at: '2025-01-01', ended_at: '2025-05-31', session_count: 8, game_count: 96 },
];

const MOCK_LEAGUE_SEASON_INFO: LeagueSeasonInfo = {
  id: 4,
  name: 'Season 4',
  started_at: '2026-03-01',
  session_count: 3,
  game_count: 36,
};

const MOCK_LEAGUE_CHAT: LeagueChatMessage[] = [
  { id: 1, league_id: 1, user_id: 110, player_id: 10, player_name: 'Colan Gulla', message: 'Great session yesterday! Who\'s in for Thursday?', created_at: '2026-03-19T14:22:00Z', is_mine: false, initials: 'CG' },
  { id: 2, league_id: 1, user_id: 101, player_id: 1, player_name: 'Patrick Schwagler', message: 'I\'m in. Same time 3pm?', created_at: '2026-03-19T14:35:00Z', is_mine: true, initials: 'PS' },
  { id: 3, league_id: 1, user_id: 111, player_id: 11, player_name: 'Ken Fawwar', message: 'I\'ll be there. Any idea if the courts are reserved?', created_at: '2026-03-19T14:40:00Z', is_mine: false, initials: 'KF' },
  { id: 4, league_id: 1, user_id: 110, player_id: 10, player_name: 'Colan Gulla', message: 'Yeah courts 1-3 reserved from 3-6pm', created_at: '2026-03-19T14:45:00Z', is_mine: false, initials: 'CG' },
  { id: 5, league_id: 1, user_id: 101, player_id: 1, player_name: 'Patrick Schwagler', message: 'Perfect. See everyone there!', created_at: '2026-03-19T15:00:00Z', is_mine: true, initials: 'PS' },
];

const MOCK_LEAGUE_EVENTS: LeagueEvent[] = [
  {
    id: 1,
    title: 'Thursday Session #4',
    date: '2026-03-24',
    month_abbr: 'MAR',
    day: 24,
    time_label: '3:00 PM - 6:00 PM',
    spots_total: 16,
    spots_remaining: 6,
    court_name: 'QBK Sports (Courts 1-3)',
    status: 'upcoming',
    user_status: 'signed_up',
    attendee_count: 10,
  },
  {
    id: 2,
    title: 'Sunday Pickup Session',
    date: '2026-03-26',
    month_abbr: 'MAR',
    day: 26,
    time_label: '10:00 AM - 1:00 PM',
    spots_total: 12,
    spots_remaining: 3,
    court_name: 'QBK Sports (Courts 2-4)',
    status: 'upcoming',
    user_status: 'none',
    attendee_count: 9,
  },
  {
    id: 3,
    title: 'Thursday Session #5',
    date: '2026-03-31',
    month_abbr: 'MAR',
    day: 31,
    time_label: '3:00 PM - 6:00 PM',
    spots_total: 16,
    spots_remaining: 16,
    court_name: 'QBK Sports (Courts 1-3)',
    status: 'upcoming',
    user_status: 'none',
    attendee_count: 0,
  },
];

const MOCK_LEAGUE_SCHEDULE: LeagueScheduleRow[] = [
  { day_of_week: 'Thursday', time_label: '3:00 PM - 6:00 PM', court_name: 'QBK Sports (Courts 1-3)' },
  { day_of_week: 'Sunday', time_label: '10:00 AM - 1:00 PM', court_name: 'QBK Sports (Courts 2-4)' },
];

const MOCK_LEAGUE_MEMBERS: LeagueMemberRow[] = [
  { player_id: 10, display_name: 'C. Gulla', initials: 'CG', role: 'admin', joined_at: '2025-01-01' },
  { player_id: 11, display_name: 'K. Fawwar', initials: 'KF', role: 'member', joined_at: '2025-01-01' },
  { player_id: 1, display_name: 'P. Schwagler', initials: 'PS', role: 'member', joined_at: '2025-01-05' },
  { player_id: 12, display_name: 'A. Marthey', initials: 'AM', role: 'member', joined_at: '2025-01-05' },
  { player_id: 13, display_name: 'S. Jindash', initials: 'SJ', role: 'member', joined_at: '2025-02-01' },
  { player_id: 14, display_name: 'J. Drabos', initials: 'JD', role: 'member', joined_at: '2025-02-10' },
  { player_id: 15, display_name: 'M. Salizar', initials: 'MS', role: 'member', joined_at: '2025-03-01' },
  { player_id: 16, display_name: 'R. Torres', initials: 'RT', role: 'member', joined_at: '2025-03-15' },
];

const MOCK_LEAGUE_JOIN_REQUESTS: LeagueJoinRequest[] = [
  { id: 1, player_id: 99, display_name: 'T. Wilson', initials: 'TW', requested_at: '2026-03-18', status: 'pending', message: 'Looking to join a competitive league!' },
  { id: 2, player_id: 98, display_name: 'B. Lopez', initials: 'BL', requested_at: '2026-03-19', status: 'pending', message: null },
];

const MOCK_LEAGUE_INFO: LeagueInfoDetail = {
  id: 1,
  description: 'Competitive open-level men\'s beach volleyball league at QBK Sports.',
  access_type: 'open',
  level: 'Open',
  location_name: 'Queens, NY',
  home_court_name: 'QBK Sports',
  members: MOCK_LEAGUE_MEMBERS,
  seasons: MOCK_LEAGUE_SEASONS,
  join_requests: MOCK_LEAGUE_JOIN_REQUESTS,
};

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

const MOCK_FIND_LEAGUES: FindLeagueResult[] = [
  {
    id: 1,
    name: 'QBK Open Men',
    gender: 'mens',
    level: 'Open',
    access_type: 'open',
    location_name: 'Queens, NY',
    member_count: 24,
    friends_in_league: [{ player_id: 10, initials: 'CG' }, { player_id: 11, initials: 'KF' }],
    user_status: 'member',
  },
  {
    id: 2,
    name: 'Brooklyn Coed Summer',
    gender: 'coed',
    level: 'AA',
    access_type: 'open',
    location_name: 'Brooklyn, NY',
    member_count: 18,
    friends_in_league: [{ player_id: 60, initials: 'JD' }],
    user_status: 'none',
  },
  {
    id: 3,
    name: 'Manhattan Beach Ladies',
    gender: 'womens',
    level: 'A',
    access_type: 'invite_only',
    location_name: 'Manhattan Beach, CA',
    member_count: 14,
    friends_in_league: [],
    user_status: 'none',
  },
  {
    id: 4,
    name: 'Astoria Competitive Men',
    gender: 'mens',
    level: 'Open',
    access_type: 'open',
    location_name: 'Queens, NY',
    member_count: 20,
    friends_in_league: [{ player_id: 62, initials: 'SJ' }],
    user_status: 'requested',
  },
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
  game_history: MOCK_GAMES.slice(0, 3),
  is_self: playerId === 1,
});

// ---------------------------------------------------------------------------
// Session mock data
// ---------------------------------------------------------------------------

const MOCK_SESSION_PLAYERS: SessionPlayer[] = [
  { id: 1, player_id: 1, display_name: 'You', initials: 'PS', is_placeholder: false, game_count: 5 },
  { id: 2, player_id: 2, display_name: 'K. Fawwar', initials: 'KF', is_placeholder: false, game_count: 5 },
  { id: 3, player_id: 3, display_name: 'A. Marthey', initials: 'AM', is_placeholder: false, game_count: 4 },
  { id: 4, player_id: null, display_name: 'Player 4', initials: 'P4', is_placeholder: true, game_count: 3 },
  { id: 5, player_id: 5, display_name: 'C. Gulla', initials: 'CG', is_placeholder: false, game_count: 2 },
];

const MOCK_SESSION_GAMES: SessionGame[] = [
  {
    id: 1001, game_number: 1,
    team1_player1_name: 'You', team1_player2_name: 'K. Fawwar',
    team2_player1_name: 'A. Marthey', team2_player2_name: 'C. Gulla',
    team1_score: 21, team2_score: 16, winner: 1, rating_change: 4.2,
  },
  {
    id: 1002, game_number: 2,
    team1_player1_name: 'You', team1_player2_name: 'A. Marthey',
    team2_player1_name: 'K. Fawwar', team2_player2_name: 'Player 4',
    team1_score: 18, team2_score: 21, winner: 2, rating_change: -3.1,
  },
  {
    id: 1003, game_number: 3,
    team1_player1_name: 'K. Fawwar', team1_player2_name: 'C. Gulla',
    team2_player1_name: 'A. Marthey', team2_player2_name: 'Player 4',
    team1_score: null, team2_score: null, winner: null, rating_change: null,
  },
];

const MOCK_SESSION_DETAIL: SessionDetail = {
  id: 42,
  league_id: 1,
  league_name: 'QBK Open Men',
  court_name: 'QBK Sports',
  date: '2026-03-19',
  start_time: '3:00 PM',
  session_number: 3,
  status: 'active',
  session_type: 'league',
  max_players: 16,
  notes: null,
  players: MOCK_SESSION_PLAYERS,
  games: MOCK_SESSION_GAMES,
  user_wins: 5,
  user_losses: 2,
  user_rating_change: 8.9,
};

const MOCK_SESSIONS: SessionSummary[] = [
  {
    id: 42,
    date: '2026-03-19',
    session_number: 3,
    status: 'active',
    session_type: 'league',
    player_count: 5,
    game_count: 7,
    league_name: 'QBK Open Men',
    court_name: 'QBK Sports',
  },
  {
    id: 41,
    date: '2026-03-17',
    session_number: 2,
    status: 'submitted',
    session_type: 'league',
    player_count: 8,
    game_count: 12,
    league_name: 'QBK Open Men',
    court_name: 'QBK Sports',
  },
];

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
// Court photos (standalone mock — used by getCourtPhotos until backend lands)
// ---------------------------------------------------------------------------

const MOCK_COURT_PHOTOS: CourtPhoto[] = [
  {
    id: 1,
    url: 'https://picsum.photos/seed/court1/800/600',
    created_at: '2026-04-01T09:00:00Z',
  },
  {
    id: 2,
    url: 'https://picsum.photos/seed/court2/800/600',
    created_at: '2026-04-05T14:00:00Z',
  },
];

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

// ---------------------------------------------------------------------------
// Mock data — Games & Stats
// ---------------------------------------------------------------------------

const MOCK_GAMES: GameHistoryEntry[] = [
  {
    id: 101,
    session_id: 42,
    league_id: 1,
    league_name: 'QBK Open Men',
    date: '2026-03-19',
    time_label: '3:45 PM',
    result: 'win',
    team1_score: 21,
    team2_score: 18,
    team1_player1_name: 'You',
    team1_player2_name: 'K. Fawwar',
    team2_player1_name: 'A. Marthey',
    team2_player2_name: 'J. Zwyczca',
    user_on_team1: true,
    rating_change: 4.2,
    has_pending_player: false,
    is_ranked: true,
  },
  {
    id: 102,
    session_id: 42,
    league_id: 1,
    league_name: 'QBK Open Men',
    date: '2026-03-19',
    time_label: '3:10 PM',
    result: 'loss',
    team1_score: 17,
    team2_score: 21,
    team1_player1_name: 'You',
    team1_player2_name: 'S. Jindash',
    team2_player1_name: 'J. Drabos',
    team2_player2_name: 'M. Salizar',
    user_on_team1: true,
    rating_change: -3.1,
    has_pending_player: false,
    is_ranked: true,
  },
  {
    id: 103,
    session_id: 42,
    league_id: 1,
    league_name: 'QBK Open Men',
    date: '2026-03-19',
    time_label: '2:30 PM',
    result: 'win',
    team1_score: 21,
    team2_score: 15,
    team1_player1_name: 'You',
    team1_player2_name: 'K. Fawwar',
    team2_player1_name: 'S. Jindash',
    team2_player2_name: 'R. Torres',
    user_on_team1: true,
    rating_change: null,
    has_pending_player: true,
    is_ranked: true,
  },
  {
    id: 104,
    session_id: 41,
    league_id: 1,
    league_name: 'QBK Open Men',
    date: '2026-03-17',
    time_label: '11:20 AM',
    result: 'win',
    team1_score: 21,
    team2_score: 12,
    team1_player1_name: 'You',
    team1_player2_name: 'C. Gulla',
    team2_player1_name: 'D. Miniucali',
    team2_player2_name: 'M. Geda',
    user_on_team1: true,
    rating_change: 5.1,
    has_pending_player: false,
    is_ranked: true,
  },
  {
    id: 105,
    session_id: 41,
    league_id: 1,
    league_name: 'QBK Open Men',
    date: '2026-03-17',
    time_label: '10:40 AM',
    result: 'win',
    team1_score: 21,
    team2_score: 19,
    team1_player1_name: 'You',
    team1_player2_name: 'C. Gulla',
    team2_player1_name: 'K. Fawwar',
    team2_player2_name: 'A. Marthey',
    user_on_team1: true,
    rating_change: 6.3,
    has_pending_player: false,
    is_ranked: true,
  },
];

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

  // ---- Court photos (getCourtById is now a real method in api-client) ----
  async getCourtPhotos(_idOrSlug: number | string): Promise<CourtPhoto[]> {
    return Promise.resolve(MOCK_COURT_PHOTOS);
  },

  async uploadCourtPhoto(
    _idOrSlug: number | string,
    _file: { uri: string; name: string; type: string },
    _caption?: string,
  ): Promise<CourtPhoto> {
    return notImplemented('POST /api/courts/:id/photos');
  },

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

  // ---- Games & Stats — TODO(backend): GET /api/users/me/games ----
  /**
   * Returns the current user's game history, newest-first.
   * Supports optional filter by league_id and/or result ('win'|'loss').
   * TODO(backend): GET /api/users/me/games?league_id=&result=
   */
  async getMyGames(params?: {
    league_id?: number | null;
    result?: 'win' | 'loss' | null;
  }): Promise<GameHistoryEntry[]> {
    let games = [...MOCK_GAMES];
    if (params?.league_id != null) {
      games = games.filter((g) => g.league_id === params.league_id);
    }
    if (params?.result != null) {
      games = games.filter((g) => g.result === params.result);
    }
    return Promise.resolve(games);
  },

  // ---- Sessions — TODO(backend): session endpoints ----

  /**
   * Returns a list of sessions for the current user.
   * TODO(backend): GET /api/sessions
   */
  async getSessions(): Promise<SessionSummary[]> {
    return Promise.resolve(MOCK_SESSIONS);
  },

  /**
   * Returns full detail for a single session by id.
   * TODO(backend): GET /api/sessions/:id
   */
  async getSessionById(id: number): Promise<SessionDetail> {
    if (id === MOCK_SESSION_DETAIL.id) {
      return Promise.resolve({ ...MOCK_SESSION_DETAIL });
    }
    return Promise.resolve({ ...MOCK_SESSION_DETAIL, id });
  },

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

  /**
   * Returns the roster for a session.
   * TODO(backend): GET /api/sessions/:id/roster
   */
  async getSessionRoster(id: number): Promise<SessionPlayer[]> {
    if (id === MOCK_SESSION_DETAIL.id) {
      return Promise.resolve([...MOCK_SESSION_PLAYERS]);
    }
    return Promise.resolve([...MOCK_SESSION_PLAYERS]);
  },

  /**
   * Adds a player to a session (by player_id or as placeholder name).
   * TODO(backend): POST /api/sessions/:id/roster
   */
  async addSessionPlayer(
    _id: number,
    _data: { player_id?: number | null; display_name?: string },
  ): Promise<SessionPlayer> {
    return notImplemented('POST /api/sessions/:id/roster');
  },

  /**
   * Removes a player from a session roster.
   * TODO(backend): DELETE /api/sessions/:id/roster/:entryId
   */
  async removeSessionPlayer(_id: number, _entryId: number): Promise<void> {
    return notImplemented('DELETE /api/sessions/:id/roster/:entryId');
  },

  // ---- Score entry — TODO(backend): POST /api/matches (extended) ----
  /**
   * Submit a scored game from the score-game modal.
   * TODO(backend): POST /api/matches with player assignments + scores
   */
  async submitScoredGame(_data: {
    session_id?: number | null;
    league_id?: number | null;
    team1_player1_id: number;
    team1_player2_id: number;
    team2_player1_id: number;
    team2_player2_id: number;
    team1_score: number;
    team2_score: number;
    is_ranked: boolean;
    date?: string | null;
  }): Promise<{ match_id: number; rating_changes: Record<number, number> }> {
    return notImplemented('POST /api/matches (score-game)');
  },

  // ---- League detail ----

  /**
   * Returns full detail for a single league.
   * TODO(backend): GET /api/leagues/:id/detail
   */
  async getLeagueDetail(_id: number | string): Promise<LeagueDetail> {
    return Promise.resolve({ ...MOCK_LEAGUE_DETAIL });
  },

  /**
   * Returns standings for a league season.
   * TODO(backend): GET /api/leagues/:id/standings?season_id=
   */
  async getLeagueStandings(
    _id: number | string,
    _seasonId?: number | null,
  ): Promise<{ standings: LeagueStanding[]; season_info: LeagueSeasonInfo }> {
    return Promise.resolve({
      standings: [...MOCK_LEAGUE_STANDINGS],
      season_info: { ...MOCK_LEAGUE_SEASON_INFO },
    });
  },

  /**
   * Returns league seasons list for the season picker.
   * TODO(backend): GET /api/leagues/:id/seasons
   */
  async getLeagueSeasonsList(_id: number | string): Promise<LeagueSeason[]> {
    return Promise.resolve([...MOCK_LEAGUE_SEASONS]);
  },

  /**
   * Returns chat messages for a league.
   * TODO(backend): GET /api/leagues/:id/messages (extended shape)
   */
  async getLeagueChat(_id: number | string): Promise<LeagueChatMessage[]> {
    return Promise.resolve([...MOCK_LEAGUE_CHAT]);
  },

  /**
   * Sends a message to the league chat.
   * TODO(backend): POST /api/leagues/:id/messages
   */
  async sendLeagueMessage(
    _id: number | string,
    _text: string,
  ): Promise<LeagueChatMessage> {
    return notImplemented('POST /api/leagues/:id/messages');
  },

  /**
   * Returns upcoming events for the league sign-ups tab.
   * TODO(backend): GET /api/leagues/:id/events
   */
  async getLeagueEvents(
    _id: number | string,
  ): Promise<{ events: LeagueEvent[]; schedule: LeagueScheduleRow[] }> {
    return Promise.resolve({
      events: [...MOCK_LEAGUE_EVENTS],
      schedule: [...MOCK_LEAGUE_SCHEDULE],
    });
  },

  /**
   * Sign up for a league event.
   * TODO(backend): POST /api/leagues/:id/events/:eventId/signup
   */
  async signUpForEvent(
    _leagueId: number | string,
    _eventId: number,
  ): Promise<LeagueEvent> {
    return notImplemented('POST /api/leagues/:leagueId/events/:eventId/signup');
  },

  /**
   * Drop from a league event.
   * TODO(backend): DELETE /api/leagues/:id/events/:eventId/signup
   */
  async dropFromEvent(
    _leagueId: number | string,
    _eventId: number,
  ): Promise<LeagueEvent> {
    return notImplemented('DELETE /api/leagues/:leagueId/events/:eventId/signup');
  },

  /**
   * Returns full info tab payload (description, members, seasons, join requests).
   * TODO(backend): GET /api/leagues/:id/info
   */
  async getLeagueInfoDetail(_id: number | string): Promise<LeagueInfoDetail> {
    return Promise.resolve({ ...MOCK_LEAGUE_INFO, members: [...MOCK_LEAGUE_MEMBERS], seasons: [...MOCK_LEAGUE_SEASONS], join_requests: [...MOCK_LEAGUE_JOIN_REQUESTS] });
  },

  /**
   * Approve a join request (admin).
   * TODO(backend): POST /api/leagues/:id/join-requests/:requestId/approve
   */
  async approveJoinRequest(
    _id: number | string,
    _requestId: number,
  ): Promise<void> {
    return notImplemented('POST /api/leagues/:id/join-requests/:requestId/approve');
  },

  /**
   * Deny a join request (admin).
   * TODO(backend): POST /api/leagues/:id/join-requests/:requestId/deny
   */
  async denyJoinRequest(
    _id: number | string,
    _requestId: number,
  ): Promise<void> {
    return notImplemented('POST /api/leagues/:id/join-requests/:requestId/deny');
  },

  /**
   * Request to join a public league.
   * TODO(backend): POST /api/leagues/:id/join-request
   */
  async requestToJoinLeague(_id: number | string): Promise<void> {
    return notImplemented('POST /api/leagues/:id/join-request');
  },

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
   * Search/filter public leagues.
   * TODO(backend): GET /api/leagues/find?q=&gender=&level=&access_type=
   */
  async findLeagues(params?: {
    query?: string | null;
    gender?: string | null;
    level?: string | null;
    access_type?: LeagueAccessType | null;
  }): Promise<FindLeagueResult[]> {
    let results = [...MOCK_FIND_LEAGUES];
    if (params?.gender != null) {
      results = results.filter((l) => l.gender === params.gender);
    }
    if (params?.level != null) {
      results = results.filter((l) => l.level?.toLowerCase() === params.level?.toLowerCase());
    }
    if (params?.access_type != null) {
      results = results.filter((l) => l.access_type === params.access_type);
    }
    if (params?.query != null && params.query.length > 0) {
      const q = params.query.toLowerCase();
      results = results.filter((l) => l.name.toLowerCase().includes(q) || (l.location_name?.toLowerCase().includes(q) ?? false));
    }
    return Promise.resolve(results);
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
