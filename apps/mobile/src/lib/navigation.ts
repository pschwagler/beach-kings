/**
 * Type-safe route helpers for expo-router navigation.
 *
 * All route strings live here so refactors touch one file, not dozens.
 * Every helper returns an `as const` literal so expo-router's typed routes
 * accept them without `as never` casts.
 *
 * @example
 * import { routes } from '@/lib/navigation';
 * router.push(routes.league(42));
 */

export const routes = {
  // ---- Auth group ----
  welcome: () => '/(auth)/welcome' as const,
  login: () => '/(auth)/login' as const,
  signup: () => '/(auth)/signup' as const,
  forgotPassword: () => '/(auth)/forgot-password' as const,
  verify: () => '/(auth)/verify' as const,
  onboarding: () => '/(auth)/onboarding' as const,

  // ---- Tab group ----
  home: () => '/(tabs)/home' as const,
  leagues: () => '/(tabs)/leagues' as const,
  addGames: () => '/(tabs)/add-games' as const,
  social: () => '/(tabs)/social' as const,
  profile: () => '/(tabs)/profile' as const,

  // ---- Stack: leagues / sessions / courts / players ----
  league: (id: number | string) => `/(stack)/league/${id}` as const,
  leagueInvite: (id: number | string) =>
    `/(stack)/league/${id}/invite` as const,
  pendingInvites: () => '/(stack)/pending-invites' as const,
  player: (id: number | string) => `/(stack)/player/${id}` as const,
  session: (idOrCode: number | string) =>
    `/(stack)/session/${idOrCode}` as const,
  sessionEdit: (id: number | string) =>
    `/(stack)/session/${id}/edit` as const,
  sessionRoster: (id: number | string) =>
    `/(stack)/session/${id}/roster` as const,
  court: (idOrSlug: number | string) => `/(stack)/court/${idOrSlug}` as const,
  courtPhotos: (idOrSlug: number | string) =>
    `/(stack)/court/${idOrSlug}/photos` as const,
  tournament: (idOrCode: number | string) =>
    `/(stack)/tournament/${idOrCode}` as const,
  kob: (code: string) => `/(stack)/kob/${code}` as const,

  // ---- Stack: creators ----
  createSession: () => '/(stack)/session/create' as const,
  createLeague: () => '/(stack)/create-league' as const,
  createTournament: () => '/(stack)/tournament/create' as const,

  // ---- Stack: discovery ----
  findPlayers: () => '/(stack)/find-players' as const,
  findLeagues: () => '/(stack)/find-leagues' as const,
  courts: () => '/(stack)/courts' as const,
  tournaments: () => '/(stack)/tournaments' as const,

  // ---- Stack: personal ----
  myGames: () => '/(stack)/my-games' as const,
  myStats: () => '/(stack)/my-stats' as const,
  scoreGame: (matchId?: number | string) =>
    matchId !== undefined
      ? (`/(stack)/score-game?matchId=${matchId}` as const)
      : ('/(stack)/score-game' as const),
  settings: () => '/(stack)/settings' as const,
  settingsAccount: () => '/(stack)/settings/account' as const,
  settingsNotifications: () => '/(stack)/settings/notifications' as const,
  settingsPhone: () => '/(stack)/settings/phone' as const,
  changePassword: () => '/(stack)/settings/change-password' as const,

  // ---- Stack: inbox ----
  messagesList: () => '/(stack)/messages' as const,
  messages: (playerId: number | string, name?: string) =>
    name != null && name.length > 0
      ? (`/(stack)/messages/${playerId}?name=${encodeURIComponent(name)}` as const)
      : (`/(stack)/messages/${playerId}` as const),
  /** Alias for `messages` — navigates to a specific DM thread. */
  messagesThread: (playerId: number | string, name?: string) =>
    name != null && name.length > 0
      ? (`/(stack)/messages/${playerId}?name=${encodeURIComponent(name)}` as const)
      : (`/(stack)/messages/${playerId}` as const),
  notifications: () => '/(stack)/notifications' as const,

  // ---- Stack: deep links ----
  invite: (token: string) => `/(stack)/invite/${token}` as const,
} as const;

/**
 * Union of every possible concrete route string produced by {@link routes}.
 * Useful for typed props like `target?: RoutePath`.
 */
export type RoutePath = ReturnType<(typeof routes)[keyof typeof routes]>;
