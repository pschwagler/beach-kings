/**
 * League context for mobile app
 * Simplified version - can be expanded as needed
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

interface LeagueContextType {
  league: any | null;
  seasons: any[];
  members: any[];
  loading: boolean;
  error: string | null;
  refreshLeague: () => Promise<void>;
  activeSeason: any | null;
  isLeagueMember: boolean;
  isLeagueAdmin: boolean;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

export function LeagueProvider({ children, leagueId }: { children: ReactNode; leagueId: number | string }) {
  const { user } = useAuth();
  const [league, setLeague] = useState<any | null>(null);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeSeason = seasons.find((s: any) => s.is_active === true) || null;

  const isLeagueMember = members.some((m: any) => 
    String(m.player_id) === String(user?.player_id)
  );

  const isLeagueAdmin = members.some((m: any) => 
    String(m.player_id) === String(user?.player_id) && m.role?.toLowerCase() === 'admin'
  );

  const loadLeagueData = useCallback(async () => {
    if (!leagueId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [leagueData, seasonsData, membersData] = await Promise.all([
        api.getLeague(leagueId),
        api.getLeagueSeasons(leagueId),
        api.getLeagueMembers(leagueId),
      ]);
      
      setLeague(leagueData);
      setSeasons(seasonsData);
      setMembers(membersData);
    } catch (err: any) {
      console.error('Error loading league:', err);
      setError(err.response?.data?.detail || 'Failed to load league');
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    loadLeagueData();
  }, [loadLeagueData]);

  const value = {
    league,
    seasons,
    members,
    loading,
    error,
    refreshLeague: loadLeagueData,
    activeSeason,
    isLeagueMember,
    isLeagueAdmin,
  };

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

export function useLeague() {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
}



