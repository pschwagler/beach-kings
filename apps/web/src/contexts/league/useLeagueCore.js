'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { getLeague, getLeagueSeasons, getLeagueMembers } from '../../services/api';

/**
 * Manages core league data: league info, seasons, members, and derived permission state.
 *
 * @param {string|number} leagueId - The ID of the league to load.
 * @param {boolean} isAuthInitializing - Whether auth is still initializing (blocks data load).
 * @param {object|null} currentUserPlayer - The currently authenticated player object.
 * @returns {object} Core league state and callbacks.
 */
export function useLeagueCore(leagueId, isAuthInitializing, currentUserPlayer) {
  const [league, setLeague] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper function to check if a season is active based on dates
  const isSeasonActive = useCallback((season) => {
    if (!season || !season.start_date || !season.end_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day

    const startDate = new Date(season.start_date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(season.end_date);
    endDate.setHours(0, 0, 0, 0);

    return today >= startDate && today <= endDate;
  }, []);

  // Helper function to check if a season is past
  const isSeasonPast = useCallback((season) => {
    if (!season || !season.end_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(season.end_date);
    endDate.setHours(0, 0, 0, 0);

    return today > endDate;
  }, []);

  // Find active seasons (date-based)
  const activeSeasons = useMemo(() => {
    if (!seasons) return [];
    return seasons.filter(isSeasonActive);
  }, [seasons, isSeasonActive]);

  // Compute isLeagueMember from members
  const isLeagueMember = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    // Handle both string and number IDs
    return members.some(m =>
      String(m.player_id) === String(currentUserPlayer.id) ||
      Number(m.player_id) === Number(currentUserPlayer.id)
    );
  }, [currentUserPlayer, members]);

  // Compute isLeagueAdmin from members
  const isLeagueAdmin = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    // Handle both string and number IDs
    const userMember = members.find(m =>
      String(m.player_id) === String(currentUserPlayer.id) ||
      Number(m.player_id) === Number(currentUserPlayer.id)
    );
    return userMember?.role?.toLowerCase() === 'admin';
  }, [currentUserPlayer, members]);

  const loadLeagueData = useCallback(async () => {
    if (!leagueId) {
      setLoading(false);
      return;
    }

    // Don't load if auth is still initializing
    if (isAuthInitializing) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const leagueData = await getLeague(leagueId);
      setLeague(leagueData);

      // Load seasons and members in parallel
      try {
        const [seasonsData, membersData] = await Promise.all([
          getLeagueSeasons(leagueId),
          getLeagueMembers(leagueId)
        ]);
        setSeasons(seasonsData);
        setMembers(membersData);
      } catch (err) {
        console.error('Error loading league data:', err);
        // Don't fail the whole load if seasons/members fail
      }
    } catch (err) {
      console.error('Error loading league:', err);
      setError(err.response?.data?.detail || 'Failed to load league');
    } finally {
      setLoading(false);
    }
  }, [leagueId, isAuthInitializing]);

  useEffect(() => {
    // Wait for auth to finish initializing before loading league data
    // This prevents race conditions where API calls are made before tokens are set
    if (!isAuthInitializing) {
      loadLeagueData();
    }
  }, [loadLeagueData, isAuthInitializing]);

  // refreshLeague is just an alias for loadLeagueData - kept for backward compatibility
  const refreshLeague = useCallback(() => {
    return loadLeagueData();
  }, [loadLeagueData]);

  const refreshSeasons = useCallback(async () => {
    if (!leagueId) return;
    try {
      const seasonsData = await getLeagueSeasons(leagueId);
      setSeasons(seasonsData);
    } catch (err) {
      console.error('Error refreshing seasons:', err);
    }
  }, [leagueId]);

  const refreshMembers = useCallback(async () => {
    if (!leagueId) return;
    try {
      const membersData = await getLeagueMembers(leagueId);
      setMembers(membersData);
    } catch (err) {
      console.error('Error refreshing members:', err);
    }
  }, [leagueId]);

  const updateLeague = useCallback((updatedLeague) => {
    setLeague(updatedLeague);
  }, []);

  const updateMember = useCallback((memberId, updates) => {
    setMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, ...updates } : m
    ));
  }, []);

  return {
    league,
    seasons,
    members,
    loading,
    error,
    refreshLeague,
    refreshSeasons,
    refreshMembers,
    updateLeague,
    updateMember,
    activeSeasons,
    isSeasonActive,
    isSeasonPast,
    isLeagueMember,
    isLeagueAdmin,
  };
}
