/**
 * TanStack Query key factory for all league-related queries.
 *
 * Centralised here so every tab and screen can share cache entries
 * without hard-coding key arrays inline.
 */

export const leagueKeys = {
  root: ['leagues'] as const,

  // ---- list-level keys ----
  userLeagues: () => [...leagueKeys.root, 'userLeagues'] as const,
  findLeagues: (params?: Record<string, unknown>) =>
    [...leagueKeys.root, 'find', params ?? {}] as const,

  // ---- detail-level keys (per league id) ----
  detail: (id: number | string) =>
    [...leagueKeys.root, 'detail', String(id)] as const,

  standings: (id: number | string, seasonId?: number | null) =>
    [...leagueKeys.root, 'standings', String(id), seasonId ?? 'current'] as const,

  seasons: (id: number | string) =>
    [...leagueKeys.root, 'seasons', String(id)] as const,

  chat: (id: number | string) =>
    [...leagueKeys.root, 'chat', String(id)] as const,

  events: (id: number | string) =>
    [...leagueKeys.root, 'events', String(id)] as const,

  info: (id: number | string) =>
    [...leagueKeys.root, 'info', String(id)] as const,

  invites: (id: number | string) =>
    [...leagueKeys.root, 'invites', String(id)] as const,

  invitablePlayers: (id: number | string, query?: string) =>
    [...leagueKeys.root, 'invitablePlayers', String(id), query ?? ''] as const,

  playerStats: (leagueId: number | string, playerId: number | string, seasonId?: number | null) =>
    [...leagueKeys.root, 'playerStats', String(leagueId), String(playerId), seasonId ?? 'current'] as const,

  pendingInvites: () => [...leagueKeys.root, 'pendingInvites'] as const,
} as const;
