import { privateKeys, publicKeys } from '@/infrastructure/query/keys';
import { currentPlayerKeys } from '@/hooks/useCurrentPlayer';
import { dashboardKeys } from '@/hooks/useDashboard';
import { leagueKeys } from '@/components/screens/Leagues/leagueKeys';
import { statsKeys } from '@/features/stats';

describe('private Query key namespaces', () => {
  it('prefixes personalized domains with the authenticated user id', () => {
    const expectedPrefix = privateKeys.user(12);
    const keys = [
      currentPlayerKeys.me(12),
      currentPlayerKeys.homeCourts(12, 44),
      dashboardKeys.root(12),
      dashboardKeys.activeSession(12),
      dashboardKeys.courts(12, null, 'socal_sd'),
      dashboardKeys.matches(12, 44),
      statsKeys.my(12, { days: 30 }),
      leagueKeys.userLeagues(12),
      leagueKeys.findLeagues(12, { q: 'open' }),
      leagueKeys.detail(12, 8),
      leagueKeys.standings(12, 8, 3),
      leagueKeys.chat(12, 8),
      leagueKeys.receivedInvites(12),
      leagueKeys.myGames(12, 8),
    ];

    for (const key of keys) {
      expect(key.slice(0, expectedPrefix.length)).toEqual(expectedPrefix);
    }
  });

  it('cannot share personalized entries between accounts', () => {
    expect(currentPlayerKeys.me(1)).not.toEqual(currentPlayerKeys.me(2));
    expect(dashboardKeys.activeSession(1)).not.toEqual(
      dashboardKeys.activeSession(2),
    );
    expect(leagueKeys.detail(1, 8)).not.toEqual(leagueKeys.detail(2, 8));
    expect(statsKeys.my(1)).not.toEqual(statsKeys.my(2));
  });

  it('keeps the locations catalog public and account independent', () => {
    expect(publicKeys.locations()).toEqual(['public', 'locations']);
  });
});
