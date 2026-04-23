/**
 * Tests for route helper functions in @/lib/navigation.
 */
import { routes } from '@/lib/navigation';

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

  it('findPlayers route contains "find-players"', () => {
    expect(routes.findPlayers()).toContain('find-players');
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
});
