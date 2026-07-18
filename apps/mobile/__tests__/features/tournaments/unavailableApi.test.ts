import {
  FeatureUnavailableError,
  unavailableTournamentApi,
} from '@/features/tournaments/unavailableApi';

describe('unavailableTournamentApi', () => {
  it.each([
    () => unavailableTournamentApi.listTournaments(),
    () => unavailableTournamentApi.getTournament(1),
    () => unavailableTournamentApi.createTournament({ name: 'Test' }),
  ])('fails loudly without returning fixture data', async (operation) => {
    await expect(operation()).rejects.toBeInstanceOf(FeatureUnavailableError);
  });
});
