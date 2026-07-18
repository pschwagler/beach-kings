/**
 * TanStack Query key factory for all league-related queries.
 *
 * Centralised here so every tab and screen can share cache entries
 * without hard-coding key arrays inline.
 */

import { privateKeys } from '@/infrastructure/query/keys';

export const leagueKeys = {
  root: (userId: number) =>
    [...privateKeys.user(userId), 'leagues'] as const,

  // ---- list-level keys ----
  lists: (userId: number) => [...leagueKeys.root(userId), 'lists'] as const,
  userLeagues: (userId: number) =>
    [...leagueKeys.lists(userId), 'mine'] as const,
  findRoot: (userId: number) =>
    [...leagueKeys.lists(userId), 'find'] as const,
  findLeagues: (userId: number, params?: Record<string, unknown>) =>
    [...leagueKeys.findRoot(userId), params ?? {}] as const,

  // ---- detail-level keys (per league id) ----
  league: (userId: number, id: number | string) =>
    [...leagueKeys.root(userId), 'league', String(id)] as const,
  detail: (userId: number, id: number | string) =>
    [...leagueKeys.league(userId, id), 'detail'] as const,

  standings: (userId: number, id: number | string, seasonId?: number | 'all' | null) =>
    [...leagueKeys.league(userId, id), 'standings', seasonId ?? 'current'] as const,

  seasons: (userId: number, id: number | string) =>
    [...leagueKeys.league(userId, id), 'seasons'] as const,

  chat: (userId: number, id: number | string) =>
    [...leagueKeys.league(userId, id), 'chat'] as const,

  events: (userId: number, id: number | string) =>
    [...leagueKeys.league(userId, id), 'events'] as const,

  info: (userId: number, id: number | string) =>
    [...leagueKeys.league(userId, id), 'info'] as const,

  invites: (userId: number, id: number | string) =>
    [...leagueKeys.league(userId, id), 'invites'] as const,

  invitablePlayers: (userId: number, id: number | string, query?: string) =>
    [...leagueKeys.league(userId, id), 'invitablePlayers', query ?? ''] as const,

  playerStats: (userId: number, leagueId: number | string, playerId: number | string, seasonId?: number | null) =>
    [...leagueKeys.league(userId, leagueId), 'playerStats', String(playerId), seasonId ?? 'current'] as const,

  myGames: (userId: number, leagueId: number | string) =>
    [...leagueKeys.league(userId, leagueId), 'games', 'mine'] as const,
  allGames: (userId: number, leagueId: number | string) =>
    [...leagueKeys.league(userId, leagueId), 'games', 'all'] as const,

  pendingInvites: (userId: number) =>
    [...leagueKeys.root(userId), 'invites', 'sent'] as const,

  receivedInvites: (userId: number) =>
    [...leagueKeys.root(userId), 'invites', 'received'] as const,
} as const;
