/**
 * Tests for route helper functions in @/lib/navigation.
 */
import * as fs from 'fs';
import * as path from 'path';
import { routes, resolveUp, routeUp } from '@/lib/navigation';

describe('routes', () => {
  it('league route contains the id', () => {
    expect(routes.league(1)).toContain('league/1');
  });

  it('player route contains the id', () => {
    expect(routes.player(42)).toContain('player/42');
  });

  it('session route contains the code', () => {
    expect(routes.session('abc')).toContain('session/abc');
  });

  it('settings route contains "settings"', () => {
    expect(routes.settings()).toContain('settings');
  });

  it('court route contains the slug', () => {
    expect(routes.court('venice-beach')).toContain('court/venice-beach');
  });

  it('kob route contains the code', () => {
    expect(routes.kob('xyz')).toContain('kob/xyz');
  });

  it('messages route contains the player id', () => {
    expect(routes.messages(7)).toContain('messages/7');
  });

  it('invite route contains the token', () => {
    expect(routes.invite('tok123')).toContain('invite/tok123');
  });

  it('createSession route contains "session"', () => {
    expect(routes.createSession()).toContain('session');
  });

  it('createSession normalizes selected player IDs into the handoff route', () => {
    expect(
      routes.createSession({ leagueId: 3, playerIds: [10, 11, 10, -1] }),
    ).toBe('/(stack)/session/create?leagueId=3&playerIds=10,11');
  });

  it('findPlayers route contains "find-players"', () => {
    expect(routes.findPlayers()).toContain('find-players');
  });

  it('social route is the plain tab path with no args', () => {
    expect(routes.social()).toBe('/(tabs)/social');
  });

  it('social route with a tab appends the ?tab= query', () => {
    expect(routes.social({ tab: 'notifications' })).toBe(
      '/(tabs)/social?tab=notifications',
    );
  });

  it('tournaments route contains "tournaments"', () => {
    expect(routes.tournaments()).toContain('tournaments');
  });

  it('accepts string ids for league', () => {
    expect(routes.league('my-league')).toContain('league/my-league');
  });

  it('createLeague route contains "create-league"', () => {
    expect(routes.createLeague()).toContain('create-league');
  });

  it('findLeagues route contains "find-leagues"', () => {
    expect(routes.findLeagues()).toContain('find-leagues');
  });

  it('myGames route contains "my-games"', () => {
    expect(routes.myGames()).toContain('my-games');
  });

  it('myStats route contains "my-stats"', () => {
    expect(routes.myStats()).toContain('my-stats');
  });

  it('friends deep-link is deterministic', () => {
    expect(routes.social({ tab: 'friends' })).toBe(
      '/(tabs)/social?tab=friends',
    );
  });
});

describe('resolveUp', () => {
  const seg = (pattern: string): string[] => pattern.split('/');

  // Each case pins the Up target to the value the screen previously hardcoded
  // as `backFallback`, proving the centralized map preserves behavior.
  const staticCases: ReadonlyArray<readonly [string, string]> = [
    ['(stack)/settings', routes.profile()],
    ['(stack)/settings/notifications', routes.settings()],
    ['(stack)/settings/appearance', routes.settings()],
    ['(stack)/settings/change-password', routes.settings()],
    ['(stack)/settings/privacy', routes.settings()],
    ['(stack)/settings/phone', routes.settings()],
    ['(stack)/settings/feedback', routes.settings()],
    ['(stack)/find-leagues', routes.leagues()],
    ['(stack)/received-invites', routes.leagues()],
    ['(stack)/pending-invites', routes.leagues()],
    ['(stack)/league/[id]', routes.leagues()],
    ['(stack)/player/[id]', routes.social()],
    ['(stack)/courts', routes.home()],
    ['(stack)/court/[id]', routes.courts()],
    ['(stack)/session/[id]', routes.home()],
    ['(stack)/session/create', routes.addGames()],
    ['(stack)/tournaments', routes.home()],
    ['(stack)/tournament/[id]', routes.tournaments()],
    ['(stack)/tournament/create', routes.tournaments()],
    ['(stack)/my-games', routes.profile()],
    ['(stack)/my-stats', routes.profile()],
    ['(stack)/edit-profile', routes.profile()],
    ['(stack)/kob/[code]', routes.home()],
    ['(stack)/invite-players', routes.home()],
    ['(auth)/login', routes.welcome()],
    ['(auth)/signup', routes.welcome()],
    ['(auth)/forgot-password', routes.welcome()],
    ['(auth)/verify', routes.welcome()],
    ['(stack)/messages', routes.social({ tab: 'messages' })],
    ['(stack)/messages/[playerId]', routes.social({ tab: 'messages' })],
    ['(stack)/notifications', routes.social({ tab: 'notifications' })],
    ['(stack)/find-players', routes.social({ tab: 'findplayers' })],
    ['(stack)/create-league', routes.leagues()],
    ['(stack)/add-new-player', routes.addGames()],
    ['(stack)/score-game', routes.addGames()],
    ['(stack)/invite/[token]', routes.home()],
  ];

  it.each(staticCases)('%s → %s', (pattern, expected) => {
    expect(resolveUp(seg(pattern))).toBe(expected);
  });

  it('resolves dynamic parents from route params', () => {
    expect(resolveUp(seg('(stack)/league/[id]/invite'), { id: '7' })).toBe(
      routes.league(7),
    );
    expect(resolveUp(seg('(stack)/court/[id]/photos'), { id: 'venice' })).toBe(
      routes.court('venice'),
    );
    expect(resolveUp(seg('(stack)/session/[id]/edit'), { id: '99' })).toBe(
      routes.session(99),
    );
    expect(resolveUp(seg('(stack)/session/[id]/roster'), { id: '99' })).toBe(
      routes.session(99),
    );
  });

  it('handles array-valued params by taking the first value', () => {
    expect(
      resolveUp(seg('(stack)/league/[id]/invite'), { id: ['7', '8'] }),
    ).toBe(routes.league(7));
  });

  it('returns undefined for a route with no declared parent', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveUp(seg('(stack)/some-unmapped-route'))).toBeUndefined();
    expect(resolveUp([])).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('warns in dev when a (stack) route has no routeUp entry', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    resolveUp(seg('(stack)/some-unmapped-route'));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('(stack)/some-unmapped-route'),
    );
    warnSpy.mockRestore();
  });

  it('does not warn for a mapped (stack) route', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    resolveUp(seg('(stack)/my-games'));
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not warn for a route outside the (stack) group (e.g. no parent needed)', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    resolveUp(seg('(tabs)/home'));
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Filesystem exhaustiveness — every pushable (stack) route must have a
// routeUp entry, so a new screen can't silently fall back to Home just
// because the author forgot the map. This pins routeUp to the actual route
// files instead of the other way around.
// ---------------------------------------------------------------------------

describe('routeUp exhaustiveness (filesystem)', () => {
  /** Recursively collect every route file under app/(stack), skipping layouts. */
  function collectStackRoutePatterns(dir: string, baseDir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectStackRoutePatterns(fullPath, baseDir);
      }
      if (!entry.isFile()) return [];
      if (!/\.tsx?$/.test(entry.name)) return [];
      if (entry.name.startsWith('_layout')) return [];

      const relative = path
        .relative(baseDir, fullPath)
        .replace(/\.tsx?$/, '')
        .replace(/\\/g, '/');
      const withoutIndex = relative.replace(/\/index$/, '');
      return [`(stack)/${withoutIndex}`];
    });
  }

  it('every route file under app/(stack) has a routeUp entry', () => {
    const stackDir = path.resolve(__dirname, '../../app/(stack)');
    const patterns = collectStackRoutePatterns(stackDir, stackDir);

    // Sanity check the walk actually found the routes we expect, so a broken
    // glob doesn't silently pass by finding zero files.
    expect(patterns.length).toBeGreaterThan(10);

    const missing = patterns.filter((pattern) => !(pattern in routeUp));
    expect(missing).toEqual([]);
  });
});
