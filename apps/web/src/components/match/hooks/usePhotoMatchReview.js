'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

    const isPlayerMatched = (player, playerId) => {
      if (typeof player === 'object' && player?.id) return true;
      if (playerId) return true;
      return false;
    };

    const unmatchedPlayers = result.matches.some(
      (match) =>
        !isPlayerMatched(match.team1_player1, match.team1_player1_id) ||
        !isPlayerMatched(match.team1_player2, match.team1_player2_id) ||
        !isPlayerMatched(match.team2_player1, match.team2_player1_id) ||
        !isPlayerMatched(match.team2_player2, match.team2_player2_id)
    );

    if (unmatchedPlayers) {
      setError(
        'Some players could not be matched. Please use the edit prompt to clarify player names.'
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await confirmPhotoMatches(
        leagueId,
        sessionId,
        selectedSeasonId,
        matchDate
      );
      setStatus('confirmed');
      onSuccess?.(response.match_ids);
    } catch (err) {
      console.error('Error confirming matches:', err);
      setError(err.response?.data?.detail || 'Failed to create games');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, result, selectedSeasonId, matchDate, leagueId, sessionId, onSuccess]);

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
    handleClose,
    handleSendEdit,
    handleConfirm,
  };
}
