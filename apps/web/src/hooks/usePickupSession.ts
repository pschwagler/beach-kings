'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getSessionByCode,
  getSessionMatches,
  getSessionParticipants,
  getSharedSessionPreview,
  joinSessionByCode,
} from '../services/api';
import { sessionMatchToDisplayFormat, buildPlaceholderIdSet, type RawMatch } from '../components/league/utils/matchUtils';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import type { Session, Match } from '../types';

/**
 * Loads and exposes session-by-code data for the session page.
 * Works for both pickup and league sessions.
 *
 * @param {string} code - Session shareable code (from route params)
 * @returns {Object} session, matches, participants, loading, error, refresh, userLeagues,
 *   isCreator, hasLessThanFourPlayers, membersForModal, transformedMatches
 */
export function usePickupSession(code: string | undefined) {
  const { currentUserPlayer, isAuthenticated, isInitializing } = useAuth();
  const currentPlayerId = currentUserPlayer?.id;
  const { userLeagues } = useApp();
  const [session, setSession] = useState<Session | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const joinedVisits = useRef(new Set<string>());
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const isCurrent = () => generation === loadGeneration.current;
    if (isInitializing) return;
    if (!code) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!isAuthenticated) {
        const preview = await getSharedSessionPreview(code);
        if (!isCurrent()) return;
        setSession(preview.session);
        setMatches(preview.matches || []);
        setParticipants(preview.participants || []);
        return;
      }
      const sess = await getSessionByCode(code);
      if (!isCurrent()) return;
      if (!sess) {
        setError('Session not found');
        setSession(null);
        setMatches([]);
        setParticipants([]);
        return;
      }
      // A shared pickup code grants joining, but protected ID reads require
      // participation. Complete the existing automatic join before those reads.
      const visitKey = `${code}:${currentPlayerId}`;
      if (sess.status === 'ACTIVE' && sess.league_id == null && currentPlayerId &&
          sess.created_by !== currentPlayerId && !joinedVisits.current.has(visitKey)) {
        await joinSessionByCode(code);
        if (!isCurrent()) return;
        joinedVisits.current.add(visitKey);
      }
      const [list, partList] = await Promise.all([
        getSessionMatches(sess.id),
        getSessionParticipants(sess.id),
      ]);
      if (!isCurrent()) return;
      setSession(sess);
      setMatches(Array.isArray(list) ? list : []);
      setParticipants(Array.isArray(partList) ? partList : []);
    } catch (err: any) {
      if (!isCurrent()) return;
      console.error('Error loading session:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load session');
      setSession(null);
      setMatches([]);
      setParticipants([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [code, isAuthenticated, isInitializing, currentPlayerId]);

  useEffect(() => {
    load();
    // Auth changes, navigation, refreshes, and unmounts invalidate every
    // pending result, including its error/loading updates.
    return () => { loadGeneration.current += 1; };
  }, [load, refreshTrigger]);

  const refresh = useCallback(() => {
    setRefreshTrigger((t) => t + 1);
  }, []);

  const isCreator = useMemo(
    () => isAuthenticated && session?.created_by != null && currentUserPlayer?.id === session.created_by,
    [isAuthenticated, session?.created_by, currentUserPlayer?.id]
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
    () => (matches || []).map((m) => sessionMatchToDisplayFormat(m as unknown as RawMatch, placeholderPlayerIds)),
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
