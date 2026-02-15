'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  getSessionByCode,
  getSessionMatches,
  getSessionParticipants,
  getUserLeagues,
} from '../services/api';
import { sessionMatchToDisplayFormat, buildPlaceholderIdSet } from '../components/league/utils/matchUtils';
import { useAuth } from '../contexts/AuthContext';

/**
 * Loads and exposes session-by-code data for the pickup session page.
 * Handles redirect when session is a league session; otherwise fetches matches and participants.
 *
 * @param {string} code - Session shareable code (from route params)
 * @returns {Object} session, matches, participants, loading, error, refresh, userLeagues,
 *   isCreator, hasLessThanFourPlayers, membersForModal, transformedMatches
 */
export function usePickupSession(code) {
  const router = useRouter();
  const { currentUserPlayer, isAuthenticated } = useAuth();
  const [session, setSession] = useState(null);
  const [matches, setMatches] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userLeagues, setUserLeagues] = useState([]);

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      const sess = await getSessionByCode(code);
      if (!sess) {
        setError('Session not found');
        setSession(null);
        setMatches([]);
        setParticipants([]);
        return;
      }
      if (sess.league_id != null) {
        const searchParams = new URLSearchParams();
        searchParams.set('tab', 'matches');
        if (sess.season_id != null) searchParams.set('season', String(sess.season_id));
        router.replace(`/league/${sess.league_id}?${searchParams.toString()}`);
        return;
      }
      setSession(sess);
      const [list, partList] = await Promise.all([
        getSessionMatches(sess.id),
        getSessionParticipants(sess.id),
      ]);
      setMatches(Array.isArray(list) ? list : []);
      setParticipants(Array.isArray(partList) ? partList : []);
    } catch (err) {
      console.error('Error loading session:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load session');
      setSession(null);
      setMatches([]);
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  }, [code, router]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  const refresh = useCallback(() => {
    setRefreshTrigger((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    getUserLeagues()
      .then((data) => setUserLeagues(Array.isArray(data) ? data : []))
      .catch(() => setUserLeagues([]));
  }, [isAuthenticated]);

  const isCreator = useMemo(
    () => session?.created_by != null && currentUserPlayer?.id === session.created_by,
    [session?.created_by, currentUserPlayer?.id]
  );

  const hasLessThanFourPlayers = useMemo(
    () => !participants || participants.length < 4,
    [participants]
  );

  const membersForModal = useMemo(
    () =>
      (participants || []).map((p) => ({
        player_id: p.player_id,
        player_name: p.full_name || `Player ${p.player_id}`,
      })),
    [participants]
  );

  const placeholderPlayerIds = useMemo(
    () => buildPlaceholderIdSet(participants),
    [participants]
  );

  const transformedMatches = useMemo(
    () => (matches || []).map((m) => sessionMatchToDisplayFormat(m, placeholderPlayerIds)),
    [matches, placeholderPlayerIds]
  );

  return {
    session,
    matches,
    participants,
    loading,
    error,
    refresh,
    userLeagues,
    isCreator,
    hasLessThanFourPlayers,
    membersForModal,
    transformedMatches,
  };
}
