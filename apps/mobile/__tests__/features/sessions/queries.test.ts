const mockSearchPlayers = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    searchPlayers: (...args: unknown[]) => mockSearchPlayers(...args),
  },
}));

import { sessionQueries } from '@/features/sessions';

describe('sessionQueries.playerSearch', () => {
  it('scopes searches by account, session, league context, and normalized query', () => {
    const first = sessionQueries.playerSearch(7, 42, '  Jordan  ', 3);
    const otherAccount = sessionQueries.playerSearch(8, 42, 'Jordan', 3);
    const otherLeague = sessionQueries.playerSearch(7, 42, 'Jordan', 4);

    expect(first.queryKey).toEqual([
      'private',
      7,
      'sessions',
      'player-search',
      42,
      3,
      'Jordan',
    ]);
    expect(otherAccount.queryKey).not.toEqual(first.queryKey);
    expect(otherLeague.queryKey).not.toEqual(first.queryKey);
  });

  it('requires an authenticated account but supports new-game searches without a session', () => {
    expect(sessionQueries.playerSearch(0, 42, '', null).enabled).toBe(false);
    expect(sessionQueries.playerSearch(7, null, '', null).enabled).toBe(true);
    expect(sessionQueries.playerSearch(7, 42, '', null).enabled).toBe(true);
  });
});
