'use client';

import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';
import { useLeagueCore } from './league/useLeagueCore';
import { useSeasonData, ALL_SEASONS_KEY } from './league/useSeasonData';
import { useSelectedPlayer } from './league/useSelectedPlayer';

export { ALL_SEASONS_KEY };

const LeagueContext = createContext(null);

export const LeagueProvider = ({ children, leagueId }) => {
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

export const useLeague = () => {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
};
