import type {
  KobTournament,
  KobTournamentDetail,
} from '@beach-kings/shared';

export class FeatureUnavailableError extends Error {
  readonly code = 'FEATURE_UNAVAILABLE';

  constructor(feature: string) {
    super(`${feature} is not available yet.`);
    this.name = 'FeatureUnavailableError';
  }
}

function unavailable<T>(): Promise<T> {
  return Promise.reject(new FeatureUnavailableError('Tournaments'));
}

/**
 * Explicit inert adapter retained with the unfinished tournament UI.
 * Production routes do not mount these screens; if they are mounted directly,
 * they fail loudly instead of returning plausible fake data.
 */
export const unavailableTournamentApi = {
  listTournaments(): Promise<KobTournament[]> {
    return unavailable();
  },

  getTournament(_idOrCode: number | string): Promise<KobTournamentDetail> {
    return unavailable();
  },

  createTournament(
    _data: Partial<KobTournament>,
  ): Promise<KobTournament> {
    return unavailable();
  },
} as const;
