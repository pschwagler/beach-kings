'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useLeagueCore } from './league/useLeagueCore';
import { useSeasonData, ALL_SEASONS_KEY } from './league/useSeasonData';
import type { SeasonDataEntry } from './league/useSeasonData';
import { useSelectedPlayer } from './league/useSelectedPlayer';

export { ALL_SEASONS_KEY };

type LeagueContextValue = { leagueId: number } &
  ReturnType<typeof useLeagueCore> &
  ReturnType<typeof useSeasonData> &
  ReturnType<typeof useSelectedPlayer> & {
    // Derived from active tab — shared consumers use these
    selectedSeasonId: number | null;
    setSelectedSeasonId: (id: number | null) => void;
    selectedSeasonData: SeasonDataEntry | null;
    activeLeagueTab: string;
    setActiveLeagueTab: (tab: string) => void;
  };

const LeagueContext = createContext<LeagueContextValue | null>(null);

export const LeagueProvider = ({ children, leagueId }: { children: ReactNode; leagueId: number }) => {
  const { currentUserPlayer, isInitializing: isAuthInitializing } = useAuth();
  const [activeLeagueTab, setActiveLeagueTab] = useState<string>('rankings');

  const core = useLeagueCore(leagueId, isAuthInitializing, currentUserPlayer);
  const season = useSeasonData(leagueId, core.seasons);

  // Derive active-tab values for shared consumers (player drawer, sign-ups)
  const selectedSeasonId = activeLeagueTab === 'matches'
    ? season.matchesSeasonId
    : season.rankingsSeasonId;

  const setSelectedSeasonId = activeLeagueTab === 'matches'
    ? season.setMatchesSeasonId
    : season.setRankingsSeasonId;

  const selectedSeasonData: SeasonDataEntry | null = activeLeagueTab === 'matches'
    ? season.matchesSeasonData
    : season.rankingsSeasonData;

  const player = useSelectedPlayer(selectedSeasonData);

  const value = useMemo<LeagueContextValue>(() => ({
    leagueId,
    ...core,
    ...season,
    // Override backward-compat values with active-tab-derived ones
    selectedSeasonId,
    setSelectedSeasonId,
    selectedSeasonData,
    activeLeagueTab,
    setActiveLeagueTab,
    ...player,
  }), [
    leagueId,
    core.league, core.seasons, core.members, core.loading, core.error,
    core.refreshLeague, core.refreshSeasons, core.refreshMembers,
    core.updateLeague, core.updateMember,
    core.activeSeasons, core.isSeasonActive, core.isSeasonPast,
    core.isLeagueMember, core.isLeagueAdmin,
    season.seasonData, season.seasonDataLoadingMap,
    season.rankingsSeasonId, season.setRankingsSeasonId, season.rankingsSeasonData,
    season.matchesSeasonId, season.setMatchesSeasonId, season.matchesSeasonData,
    season.loadSeasonData, season.refreshSeasonData,
    season.refreshMatchData, season.refreshAllSeasonsMatches, season.loadAllSeasonsRankings,
    selectedSeasonId, setSelectedSeasonId, selectedSeasonData,
    activeLeagueTab, setActiveLeagueTab,
    player.selectedPlayerId, player.selectedPlayerName,
    player.playerSeasonStats, player.playerMatchHistory,
    player.setSelectedPlayer,
  ]);

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
};

export const useLeague = (): LeagueContextValue => {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
};
