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

/**
 * The four destinations reachable from the Social hub subnav. Canonical source
 * of the tab keys; `SocialSubnav` re-exports this so components and route
 * helpers agree on the same union.
 */
export type SocialTab = 'messages' | 'notifications' | 'friends' | 'findplayers';
export type LeagueTab = 'games' | 'standings' | 'chat' | 'signups' | 'info';

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
  // Optional `{ tab }` deep-links straight to a Social subnav destination.
  // The no-arg call keeps the plain `as const` literal so existing typed-route
  // callers (Home/Profile) stay happy; the tabbed form yields a template
  // literal type callers can push directly.
  social: (params: { tab?: SocialTab } = {}) =>
    params.tab != null
      ? (`/(tabs)/social?tab=${params.tab}` as const)
      : ('/(tabs)/social' as const),
  profile: () => '/(tabs)/profile' as const,

  // ---- Stack: leagues / sessions / courts / players ----
  league: (
    id: number | string,
    params: { tab?: LeagueTab } = {},
  ) =>
    params.tab != null
      ? (`/(stack)/league/${id}?tab=${params.tab}` as const)
      : (`/(stack)/league/${id}` as const),
  leagueInvite: (id: number | string) =>
    `/(stack)/league/${id}/invite` as const,
  pendingInvites: () => '/(stack)/pending-invites' as const,
  receivedInvites: () => '/(stack)/received-invites' as const,
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
  createSession: (params: {
    leagueId?: number | null;
    seasonId?: number | null;
    playerIds?: readonly number[];
  } = {}) => {
    const qs: string[] = [];
    if (params.leagueId != null) qs.push(`leagueId=${params.leagueId}`);
    if (params.seasonId != null) qs.push(`seasonId=${params.seasonId}`);
    const playerIds = [...new Set(params.playerIds ?? [])]
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 4);
    if (playerIds.length > 0) qs.push(`playerIds=${playerIds.join(',')}`);
    return qs.length > 0
      ? (`/(stack)/session/create?${qs.join('&')}` as const)
      : ('/(stack)/session/create' as const);
  },
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
  editProfile: () => '/(stack)/edit-profile' as const,
  // Returns plain `string` rather than the `as const` literal used by other
  // routes here. expo-router typed routes can't express dynamic query strings,
  // so callers cast with `as never` at the push site. The runtime builder
  // skips null/undefined values and `encodeURIComponent`s string params.
  scoreGame: (params: {
    sessionId?: number | null;
    leagueId?: number | null;
    seasonId?: number | null;
    matchId?: number | null;
    gameNumber?: number | null;
    sessionLabel?: string | null;
    headerTitle?: string | null;
  } = {}): string => {
    const qs: string[] = [];
    const pushNum = (key: string, value?: number | null): void => {
      if (value != null) qs.push(`${key}=${value}`);
    };
    const pushStr = (key: string, value?: string | null): void => {
      if (value != null && value.length > 0) {
        qs.push(`${key}=${encodeURIComponent(value)}`);
      }
    };
    pushNum('sessionId', params.sessionId);
    pushNum('leagueId', params.leagueId);
    pushNum('seasonId', params.seasonId);
    pushNum('matchId', params.matchId);
    pushNum('gameNumber', params.gameNumber);
    pushStr('sessionLabel', params.sessionLabel);
    pushStr('headerTitle', params.headerTitle);
    return qs.length > 0
      ? `/(stack)/score-game?${qs.join('&')}`
      : '/(stack)/score-game';
  },
  // No params: AddNewPlayerContext carries the request/result, so the path
  // stays a static `as const` literal (no `as never` cast at the push site).
  addNewPlayer: () => '/(stack)/add-new-player' as const,
  // Params travel via InvitePlayersContext rather than the URL.
  invitePlayers: () => '/(stack)/invite-players' as const,
  settings: () => '/(stack)/settings' as const,
  settingsNotifications: () => '/(stack)/settings/notifications' as const,
  settingsAppearance: () => '/(stack)/settings/appearance' as const,
  settingsPhone: () => '/(stack)/settings/phone' as const,
  changePassword: () => '/(stack)/settings/change-password' as const,
  settingsFeedback: () => '/(stack)/settings/feedback' as const,
  settingsPrivacy: () => '/(stack)/settings/privacy' as const,

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

// ---------------------------------------------------------------------------
// Up navigation (deep-link / cold-start fallback)
// ---------------------------------------------------------------------------

/** Route params as returned by expo-router's `useLocalSearchParams`. */
type RouteParams = Record<string, string | string[] | undefined>;

/** First value of a route param (path params are always single strings). */
const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

/**
 * A screen's logical "Up" target — either a static route or a builder that
 * receives the current route params (for parents that depend on an id).
 */
type UpTarget = string | ((params: RouteParams) => string);

/**
 * Logical "Up" parent for each pushable screen.
 *
 * This is used ONLY when a screen is the entry point — deep link, notification
 * tap, or cold start — so there is no back-history to pop. In the normal case
 * (the user navigated in), the root `<Stack>` owns the history and
 * `router.back()` pops correctly; this map is never consulted. See
 * docs/navigation.md for the Back-vs-Up model.
 *
 * Keys are the un-normalized route pattern that `useSegments().join('/')`
 * produces: dynamic segments stay in `[param]` form and the route group is
 * included (e.g. `(stack)/court/[id]/photos`). This is the single source of
 * truth for Up targets — screens no longer hardcode `backFallback`.
 */
export const routeUp: Record<string, UpTarget> = {
  // Auth — unauthenticated screens with TopNav showBack. There is no
  // authenticated (tabs) parent to fall back to here, so these must resolve
  // explicitly to Welcome; otherwise the shared `?? routes.home()` default
  // would send a signed-out user to the authenticated Home screen.
  '(auth)/login': routes.welcome(),
  '(auth)/signup': routes.welcome(),
  '(auth)/forgot-password': routes.welcome(),
  '(auth)/verify': routes.welcome(),

  // Settings — hub reached from Profile, leaves reached from the hub
  '(stack)/settings': routes.profile(),
  '(stack)/settings/notifications': routes.settings(),
  '(stack)/settings/appearance': routes.settings(),
  '(stack)/settings/change-password': routes.settings(),
  '(stack)/settings/privacy': routes.settings(),
  '(stack)/settings/phone': routes.settings(),
  '(stack)/settings/feedback': routes.settings(),

  // Leagues
  '(stack)/find-leagues': routes.leagues(),
  '(stack)/received-invites': routes.leagues(),
  '(stack)/pending-invites': routes.leagues(),
  '(stack)/league/[id]': routes.leagues(),
  '(stack)/league/[id]/invite': (p) => routes.league(firstParam(p.id)),

  // Players
  '(stack)/player/[id]': routes.social(),

  // Courts / venues
  '(stack)/courts': routes.home(),
  '(stack)/court/[id]': routes.courts(),
  '(stack)/court/[id]/photos': (p) => routes.court(firstParam(p.id)),

  // Sessions
  '(stack)/session/[id]': routes.home(),
  '(stack)/session/[id]/edit': (p) => routes.session(firstParam(p.id)),
  '(stack)/session/[id]/roster': (p) => routes.session(firstParam(p.id)),
  '(stack)/session/create': routes.addGames(),

  // Tournaments
  '(stack)/tournaments': routes.home(),
  '(stack)/tournament/[id]': routes.tournaments(),
  '(stack)/tournament/create': routes.tournaments(),

  // Games (personal)
  '(stack)/my-games': routes.profile(),
  '(stack)/my-stats': routes.profile(),
  '(stack)/edit-profile': routes.profile(),

  // Misc
  '(stack)/kob/[code]': routes.home(),
  '(stack)/invite-players': routes.home(),

  // Inbox / social hub
  '(stack)/messages': routes.social({ tab: 'messages' }),
  '(stack)/messages/[playerId]': routes.social({ tab: 'messages' }),
  '(stack)/notifications': routes.social({ tab: 'notifications' }),
  '(stack)/find-players': routes.social({ tab: 'findplayers' }),

  // Creators
  '(stack)/create-league': routes.leagues(),
  '(stack)/add-new-player': routes.addGames(),
  '(stack)/score-game': routes.addGames(),

  // Deep links
  '(stack)/invite/[token]': routes.home(),
};

/**
 * Resolve the "Up" target for the current route.
 *
 * @param segments Result of `useSegments()` (un-normalized route segments).
 * @param params   Result of `useLocalSearchParams()`.
 * @returns The Up route, or `undefined` when the route declares no parent (the
 *   caller should then fall back to a global default such as {@link routes.home}).
 */
export function resolveUp(
  segments: readonly string[],
  params: RouteParams = {},
): string | undefined {
  const pattern = segments.join('/');
  const target = routeUp[pattern];
  if (target == null) {
    // Every pushable (stack) screen should declare an Up target so deep-link
    // / cold-start entry falls back to something more useful than Home. This
    // is dev-only so it surfaces gaps during development without being noisy
    // (or crashing) in production, where the silent `?? routes.home()`
    // fallback in useBack still applies.
    if (__DEV__ && pattern.startsWith('(stack)/')) {
      console.warn(
        `[navigation] No routeUp entry for "${pattern}" — back from a deep ` +
          'link or cold start on this screen will fall back to Home. Add an ' +
          'entry to routeUp in src/lib/navigation.ts.',
      );
    }
    return undefined;
  }
  return typeof target === 'function' ? target(params) : target;
}
