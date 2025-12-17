import { useState, useEffect, useCallback } from 'react';
import { getActiveSession, getSessions } from '../../../services/api';

/**
 * Hook to manage active session and all sessions state
 * Handles loading and polling logic
 */
export function useActiveSession({
  leagueId,
  seasons,
  selectedSeasonId,
  refreshMatchData
}) {
  const [activeSession, setActiveSession] = useState(null);
  const [allSessions, setAllSessions] = useState([]);

  /**
   * Load the active session
   */
  const loadActiveSession = useCallback(async () => {
    if (!leagueId) return null;
    try {
      const session = await getActiveSession().catch(() => null);
      // TODO: Filter by league_id when API supports it
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
      const sessions = await getSessions().catch(() => []);
      // Filter sessions by league if they have season_id that matches our league's seasons
      const leagueSeasonIds = new Set(seasons?.map(s => s.id) || []);
      const leagueSessions = sessions.filter(session => 
        session.season_id && leagueSeasonIds.has(session.season_id)
      );
      setAllSessions(leagueSessions);
    } catch (err) {
      console.error('Error loading all sessions:', err);
      setAllSessions([]);
    }
  }, [leagueId, seasons]);

  /**
   * Refresh session state
   */
  const refreshSession = useCallback(async () => {
    await loadActiveSession();
    await loadAllSessions();
    // Refresh match data in context for selected season or all active seasons
    if (selectedSeasonId && refreshMatchData) {
      await refreshMatchData(selectedSeasonId);
    }
  }, [loadActiveSession, loadAllSessions, selectedSeasonId, refreshMatchData]);

  // Load active session and all sessions on mount and when dependencies change
  useEffect(() => {
    if (leagueId && seasons?.length > 0) {
      loadActiveSession();
      loadAllSessions();
    }
  }, [leagueId, seasons, loadActiveSession, loadAllSessions]);

  // Polling: Check for new matches every 5 seconds if there's an active session
  // Uses refreshMatchData to update context - component will automatically update via selectedSeasonData
  useEffect(() => {
    if (!activeSession || !selectedSeasonId) {
      return;
    }

    const pollForNewMatches = async () => {
      try {
        // Refresh match data in context for the selected season
        if (refreshMatchData) {
          await refreshMatchData(selectedSeasonId);
        }
      } catch (err) {
        console.error('Error polling for new matches:', err);
      }
    };
    const pollInterval = setInterval(pollForNewMatches, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [activeSession, selectedSeasonId, refreshMatchData]);

  return {
    activeSession,
    allSessions,
    loadActiveSession,
    loadAllSessions,
    refreshSession
  };
}
