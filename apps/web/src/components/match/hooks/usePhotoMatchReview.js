'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  editPhotoResults,
  confirmPhotoMatches,
  cancelPhotoSession,
  subscribePhotoJobStream,
} from '../../../services/api';

/**
 * Hook for PhotoMatchReviewModal: job state, streaming, and submit logic.
 *
 * @param {Object} opts
 * @param {boolean} opts.isOpen
 * @param {number|null} opts.initialJobId
 * @param {number} opts.leagueId
 * @param {number|null} opts.sessionId
 * @param {number|null} opts.seasonId
 * @param {function()} [opts.onClose]
 * @param {function(number[])} [opts.onSuccess]
 */
export function usePhotoMatchReview({
  isOpen,
  initialJobId,
  leagueId,
  sessionId,
  seasonId,
  onClose,
  onSuccess,
}) {
  const [jobId, setJobId] = useState(initialJobId);
  const [status, setStatus] = useState('PENDING');
  const [result, setResult] = useState(null);
  const [partialMatches, setPartialMatches] = useState(null);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [conversationHistory, setConversationHistory] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(seasonId);
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [playerOverrides, setPlayerOverrides] = useState([]);

  const streamAbortRef = useRef(null);
  const prevInitialJobIdRef = useRef(initialJobId);

  useEffect(() => {
    if (!isOpen || !jobId || !leagueId || status === 'COMPLETED' || status === 'FAILED') {
      return;
    }
    streamAbortRef.current = subscribePhotoJobStream(leagueId, jobId, {
      onPartial: (data) => {
        if (data.partial_matches != null) {
          setPartialMatches(data.partial_matches);
        }
      },
      onDone: (data) => {
        setPartialMatches(null);
        setStatus(data.status || 'COMPLETED');
        if (data.status === 'COMPLETED' && data.result) {
          setResult(data.result);
          if (data.result.clarification_question) {
            setConversationHistory((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: data.result.clarification_question,
                timestamp: new Date().toISOString(),
              },
            ]);
          }
        } else if (data.status === 'FAILED') {
          setError(data.result?.error_message || 'Processing failed');
        }
      },
      onError: (data) => {
        setPartialMatches(null);
        setError(data.message || 'Stream error');
      },
    });
    return () => {
      if (streamAbortRef.current) {
        streamAbortRef.current();
        streamAbortRef.current = null;
      }
    };
  }, [isOpen, jobId, leagueId, status]);

  useEffect(() => {
    if (initialJobId !== prevInitialJobIdRef.current) {
      prevInitialJobIdRef.current = initialJobId;
      setJobId(initialJobId);
      setStatus('PENDING');
      setResult(null);
      setError(null);
      setConversationHistory([]);
      setPartialMatches(null);
      setPlayerOverrides([]);
    }
  }, [initialJobId]);

  const handleClose = useCallback(async () => {
    if (isSubmitting) return;

    if (sessionId && status !== 'confirmed') {
      try {
        await cancelPhotoSession(leagueId, sessionId);
      } catch (err) {
        console.error('[PhotoMatchReviewModal] Error cancelling session:', err);
      }
    }

    if (streamAbortRef.current) {
      streamAbortRef.current();
      streamAbortRef.current = null;
    }

    onClose?.();
  }, [isSubmitting, sessionId, status, leagueId, onClose]);

  const handleSendEdit = useCallback(async () => {
    if (!editPrompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    setConversationHistory((prev) => [
      ...prev,
      {
        role: 'user',
        content: editPrompt.trim(),
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const response = await editPhotoResults(leagueId, sessionId, editPrompt.trim());
      setJobId(response.job_id);
      setStatus('PENDING');
      setResult(null);
      setEditPrompt('');
      setPlayerOverrides([]);
      if (streamAbortRef.current) {
        streamAbortRef.current();
        streamAbortRef.current = null;
      }
    } catch (err) {
      console.error('Error sending edit:', err);
      setError(err.response?.data?.detail || 'Failed to send edit');
    } finally {
      setIsSubmitting(false);
    }
  }, [editPrompt, isSubmitting, leagueId, sessionId]);

  /**
   * Resolve an unrecognized player name to a known player.
   * Updates result.matches in state so the table reflects the resolution immediately.
   */
  const handleResolvePlayer = useCallback((rawName, playerId, playerName) => {
    // Upsert into overrides
    setPlayerOverrides((prev) => {
      const filtered = prev.filter((o) => o.raw_name !== rawName);
      return [...filtered, { raw_name: rawName, player_id: playerId, player_name: playerName }];
    });

    // Update result.matches in state so table shows resolved names immediately
    setResult((prev) => {
      if (!prev?.matches) return prev;
      const playerFields = ['team1_player1', 'team1_player2', 'team2_player1', 'team2_player2'];
      const updatedMatches = prev.matches.map((match) => {
        const newMatch = { ...match };
        for (const field of playerFields) {
          // Check if this field is unmatched and has the raw name
          if (newMatch[`${field}_id`]) continue;
          const player = newMatch[field];
          let fieldRawName = '';
          if (typeof player === 'object' && player?.name) {
            fieldRawName = player.name.trim();
          } else if (typeof player === 'string') {
            fieldRawName = player.trim();
          }
          if (fieldRawName.toLowerCase() === rawName.toLowerCase()) {
            newMatch[`${field}_id`] = playerId;
            newMatch[`${field}_matched`] = playerName;
            newMatch[`${field}_confidence`] = 1.0;
          }
        }
        return newMatch;
      });
      return { ...prev, matches: updatedMatches };
    });
  }, []);

  /**
   * Derive unique unmatched player names from current result.matches.
   */
  const unmatchedNames = useMemo(() => {
    if (!result?.matches) return [];
    const playerFields = ['team1_player1', 'team1_player2', 'team2_player1', 'team2_player2'];
    const names = new Set();
    for (const match of result.matches) {
      for (const field of playerFields) {
        if (match[`${field}_id`]) continue;
        const player = match[field];
        let rawName = '';
        if (typeof player === 'object' && player?.name) {
          rawName = player.name.trim();
        } else if (typeof player === 'string') {
          rawName = player.trim();
        }
        if (rawName) {
          names.add(rawName);
        }
      }
    }
    return [...names];
  }, [result?.matches]);

  const handleConfirm = useCallback(async () => {
    if (isSubmitting || !result?.matches?.length) return;

    if (!selectedSeasonId) {
      setError('Please select a season');
      return;
    }
    if (!matchDate) {
      setError('Please select a match date');
      return;
    }

    // Check for unmatched players (accounting for overrides already applied to state)
    const isPlayerMatched = (player, playerId) => {
      if (typeof player === 'object' && player?.id) return true;
      if (playerId) return true;
      return false;
    };

    const hasUnmatched = result.matches.some(
      (match) =>
        !isPlayerMatched(match.team1_player1, match.team1_player1_id) ||
        !isPlayerMatched(match.team1_player2, match.team1_player2_id) ||
        !isPlayerMatched(match.team2_player1, match.team2_player1_id) ||
        !isPlayerMatched(match.team2_player2, match.team2_player2_id)
    );

    if (hasUnmatched) {
      setError(
        'Some players could not be matched. Resolve all unrecognized players before confirming.'
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const overridesPayload = playerOverrides.length > 0 ? playerOverrides : null;
      const response = await confirmPhotoMatches(
        leagueId,
        sessionId,
        selectedSeasonId,
        matchDate,
        overridesPayload
      );
      setStatus('confirmed');
      onSuccess?.(response.match_ids);
    } catch (err) {
      console.error('Error confirming matches:', err);
      setError(err.response?.data?.detail || 'Failed to create games');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, result, selectedSeasonId, matchDate, leagueId, sessionId, onSuccess, playerOverrides]);

  return {
    jobId,
    status,
    result,
    partialMatches,
    error,
    isSubmitting,
    editPrompt,
    setEditPrompt,
    conversationHistory,
    selectedSeasonId,
    setSelectedSeasonId,
    matchDate,
    setMatchDate,
    unmatchedNames,
    handleClose,
    handleSendEdit,
    handleConfirm,
    handleResolvePlayer,
  };
}
