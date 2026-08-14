import { useState, useEffect, useCallback } from 'react';
import { getActiveSession, getSessions } from '../../../services/api';

interface UseActiveSessionParams {
  leagueId: number | null | undefined;
  selectedSeasonId: number | null;
  refreshMatchData: ((seasonId: number) => Promise<void>) | null | undefined;
  refreshAllSeasonsMatches: (() => Promise<void>) | null | undefined;
}

/**
 * Hook to manage active session and all sessions state
 * Handles loading and polling logic
 */
export function useActiveSession({
  leagueId,
  selectedSeasonId,
  refreshMatchData,
  refreshAllSeasonsMatches,
}: UseActiveSessionParams) {
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [allSessions, setAllSessions] = useState<any[]>([]);

  /**
   * Load the active session
   */
  const loadActiveSession = useCallback(async () => {
    if (!leagueId) return null;
    try {
      // getActiveSession now filters client-side from all league sessions
      const session = await getActiveSession(leagueId).catch((): null => null);
      setActiveSession(session);
      return session;
    } catch (err) {
      console.error('Error loading active session:', err);
      setActiveSession(null);
      return null;
    }
  }, [leagueId]);

  /**
   * Load all sessions for the league
   */
  const loadAllSessions = useCallback(async () => {
    if (!leagueId) return;
    try {
      // API now filters by league, so no client-side filtering needed
      const sessions = await getSessions(leagueId).catch((): unknown[] => []);
      setAllSessions(sessions);
    } catch (err) {
      console.error('Error loading all sessions:', err);
      setAllSessions([]);
    }
  }, [leagueId]);

  /**
   * Refresh session state
   */
  const refreshSession = useCallback(async () => {
    await loadActiveSession();
    await loadAllSessions();
    // Refresh match data: use season-scoped refresh when a season is selected,
    // or the all-time refresh for zero-season / all-seasons view.
    if (selectedSeasonId) {
      if (refreshMatchData) {
        await refreshMatchData(selectedSeasonId);
      }
    } else if (refreshAllSeasonsMatches) {
      await refreshAllSeasonsMatches();
    }
  }, [loadActiveSession, loadAllSessions, selectedSeasonId, refreshMatchData, refreshAllSeasonsMatches]);

  // Load active session and all sessions on mount and when dependencies change.
  // A zero-season league can still have gap-game sessions, so we load whenever
  // leagueId is available regardless of season count.
  useEffect(() => {
    if (leagueId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount
      loadActiveSession();
      loadAllSessions();
    }
  }, [leagueId, loadActiveSession, loadAllSessions]);

  // Polling: Check for new matches every 5 seconds if there's an active session.
  // Polls regardless of season selection so zero-season gap-game sessions are covered:
  // when selectedSeasonId is set, refresh that season's matches; when null (all-time
  // / zero-season view), refresh via refreshAllSeasonsMatches instead.
  useEffect(() => {
    if (!activeSession) {
      return;
    }

    const pollForNewMatches = async () => {
      if (selectedSeasonId) {
        if (refreshMatchData) {
          await refreshMatchData(selectedSeasonId);
        }
      } else if (refreshAllSeasonsMatches) {
        await refreshAllSeasonsMatches();
      }
    };
    const pollInterval = setInterval(pollForNewMatches, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [activeSession, selectedSeasonId, refreshMatchData, refreshAllSeasonsMatches]);

  return {
    activeSession,
    allSessions,
    loadActiveSession,
    loadAllSessions,
    refreshSession
  };
}

