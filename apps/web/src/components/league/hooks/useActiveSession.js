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
      // getActiveSession now filters client-side from all league sessions
      const session = await getActiveSession(leagueId).catch(() => null);
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
      const sessions = await getSessions(leagueId).catch(() => []);
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
