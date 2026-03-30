'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useLeagueCore } from './league/useLeagueCore';
import { useSeasonData, ALL_SEASONS_KEY } from './league/useSeasonData';
import { useSelectedPlayer } from './league/useSelectedPlayer';

export { ALL_SEASONS_KEY };

type LeagueContextValue = { leagueId: number } &
  ReturnType<typeof useLeagueCore> &
  ReturnType<typeof useSeasonData> &
  ReturnType<typeof useSelectedPlayer>;

const LeagueContext = createContext<LeagueContextValue | null>(null);

export const LeagueProvider = ({ children, leagueId }: { children: ReactNode; leagueId: number }) => {
  const { currentUserPlayer, isInitializing: isAuthInitializing } = useAuth();

  const core = useLeagueCore(leagueId, isAuthInitializing, currentUserPlayer);
  const season = useSeasonData(leagueId, core.seasons);
  const player = useSelectedPlayer(season.selectedSeasonData);

  const value = {
    leagueId,
    ...core,
    ...season,
    ...player,
  };

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
};

export const useLeague = (): LeagueContextValue => {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
};
