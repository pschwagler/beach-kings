import { useState, useEffect, useCallback } from 'react';
import { getUserLeagues, getLeagueSeasons, getActiveSession } from '../../../services/api';

/**
 * Hook to manage league and season selection state
 * Consolidates 8 state variables into one hook
 */
export function useLeagueSeasonSelection({
  isOpen,
  leagueMatchOnly,
  defaultLeagueId,
  league,
  sessionSeasonId,
  defaultSeasonId,
  matchType: initialMatchType
}) {
  const [matchType, setMatchType] = useState(leagueMatchOnly ? 'league' : 'non-league');
  const [selectedLeagueId, setSelectedLeagueId] = useState(defaultLeagueId);
  const [availableLeagues, setAvailableLeagues] = useState([]);
  const [activeSeason, setActiveSeason] = useState(null);
  const [allSeasons, setAllSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [hasActiveSession, setHasActiveSession] = useState(true); // Assume true initially
  const [isSeasonDisabled, setIsSeasonDisabled] = useState(false);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingSeason, setLoadingSeason] = useState(false);

  // Helper to check if season is active based on dates
  const isSeasonActive = useCallback((season) => {
    if (!season || !season.start_date || !season.end_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = new Date(season.start_date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(season.end_date);
    endDate.setHours(0, 0, 0, 0);
    return today >= startDate && today <= endDate;
  }, []);

  // Load user leagues when modal opens and match type is league
  useEffect(() => {
    if (isOpen && matchType === 'league' && !leagueMatchOnly) {
      const loadLeagues = async () => {
        setLoadingLeagues(true);
        try {
          const leagues = await getUserLeagues();
          setAvailableLeagues(leagues || []);
          // If defaultLeagueId is provided, select it
          if (defaultLeagueId && leagues) {
            const defaultLeague = leagues.find(l => l.id === defaultLeagueId);
            if (defaultLeague) {
              setSelectedLeagueId(defaultLeagueId);
            }
          }
        } catch (error) {
          console.error('Error loading leagues:', error);
          setAvailableLeagues([]);
        } finally {
          setLoadingLeagues(false);
        }
      };
      loadLeagues();
    } else if (leagueMatchOnly && defaultLeagueId) {
      // If leagueMatchOnly, use league from context if available, or create a placeholder
      setSelectedLeagueId(defaultLeagueId);
      if (league) {
        setAvailableLeagues([{ id: league.id, name: league.name }]);
      } else {
        setAvailableLeagues([{ id: defaultLeagueId, name: 'Current League' }]);
      }
    } else if (matchType === 'non-league') {
      setSelectedLeagueId(null);
      setActiveSeason(null);
    }
  }, [isOpen, matchType, leagueMatchOnly, defaultLeagueId, league]);

  // Load seasons when league is selected
  useEffect(() => {
    if (selectedLeagueId && matchType === 'league') {
      const loadSeasons = async () => {
        setLoadingSeason(true);
        try {
          // If sessionSeasonId is provided, we're opening from an active session
          // Pre-populate and disable the season dropdown
          if (sessionSeasonId) {
            setSelectedSeasonId(sessionSeasonId);
            setIsSeasonDisabled(true);
            setHasActiveSession(true);
            
            const seasons = await getLeagueSeasons(selectedLeagueId);
            setAllSeasons(seasons || []);
            
            // Find and set the active season
            const season = seasons.find(s => s.id === sessionSeasonId);
            if (season) {
              setActiveSeason(season);
            }
          } else {
            // No session provided - check if there's an active session
            let hasActive = true;
            try {
              const activeSession = await getActiveSession(selectedLeagueId).catch(() => null);
              hasActive = !!activeSession;
              setHasActiveSession(hasActive);
            } catch (err) {
              // If we can't check, assume there's an active session
              setHasActiveSession(true);
            }
            
            setIsSeasonDisabled(false); // Allow selection when not from a session
            
            const seasons = await getLeagueSeasons(selectedLeagueId);
            setAllSeasons(seasons || []);
            
            // Use defaultSeasonId if provided, otherwise auto-select if only one season
            if (defaultSeasonId !== null && defaultSeasonId !== undefined) {
              // Use the provided default season
              setSelectedSeasonId(defaultSeasonId);
              const season = seasons.find(s => s.id === defaultSeasonId);
              if (season) {
                setActiveSeason(season);
              }
            } else if (seasons.length === 1) {
              // If exactly one season, select it automatically
              setSelectedSeasonId(seasons[0].id);
              setActiveSeason(seasons[0]);
            } else {
              // Multiple seasons - clear selection (user must choose)
              setSelectedSeasonId(null);
              setActiveSeason(null);
            }
          }
        } catch (error) {
          console.error('Error loading seasons:', error);
          setAllSeasons([]);
          setActiveSeason(null);
          setSelectedSeasonId(null);
        } finally {
          setLoadingSeason(false);
        }
      };
      loadSeasons();
    } else {
      setAllSeasons([]);
      setActiveSeason(null);
      setSelectedSeasonId(null);
      setHasActiveSession(true);
      setIsSeasonDisabled(false);
    }
  }, [selectedLeagueId, matchType, sessionSeasonId, defaultSeasonId, isSeasonActive]);

  // Reset match type when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setMatchType(leagueMatchOnly ? 'league' : 'non-league');
      setSelectedLeagueId(defaultLeagueId);
      // Reset season disabled state - will be set based on sessionSeasonId in the season loading effect
      setIsSeasonDisabled(false);
      // If defaultSeasonId is provided and no sessionSeasonId, use it as initial value
      if (defaultSeasonId !== null && defaultSeasonId !== undefined && !sessionSeasonId) {
        setSelectedSeasonId(defaultSeasonId);
      }
    }
  }, [isOpen, leagueMatchOnly, defaultLeagueId, defaultSeasonId, sessionSeasonId]);

  return {
    matchType,
    setMatchType,
    selectedLeagueId,
    setSelectedLeagueId,
    availableLeagues,
    activeSeason,
    allSeasons,
    selectedSeasonId,
    setSelectedSeasonId,
    setActiveSeason,
    hasActiveSession,
    isSeasonDisabled,
    loadingLeagues,
    loadingSeason,
    isSeasonActive
  };
}

