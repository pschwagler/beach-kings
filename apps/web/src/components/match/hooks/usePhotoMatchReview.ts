'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  editPhotoResults,
  confirmPhotoMatches,
  cancelPhotoSession,
  subscribePhotoJobStream,
} from '../../../services/api';

/** Job status constants shared between hook and modal. */
export const JOB_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CONFIRMED: 'confirmed',
};

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
interface UsePhotoMatchReviewParams {
  isOpen: boolean;
  initialJobId: number | null;
  leagueId: number;
  sessionId: number | null;
  seasonId: number | null;
  onClose?: () => void;
  onSuccess?: (matchIds: number[], seasonId: number) => void;
}

export function usePhotoMatchReview({
  isOpen,
  initialJobId,
  leagueId,
  sessionId,
  seasonId,
  onClose,
  onSuccess,
}: UsePhotoMatchReviewParams) {
  const [jobId, setJobId] = useState<number | null>(initialJobId);
  const [status, setStatus] = useState<string>(JOB_STATUS.PENDING);
  // result holds the AI photo extraction result — shape is opaque to the frontend
  const [result, setResult] = useState<any | null>(null);
  // partialMatches holds incremental streaming results before the job completes
  const [partialMatches, setPartialMatches] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(seasonId);
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split('T')[0]);
  // playerOverrides: manual player resolutions for unrecognized names from the AI result
  const [playerOverrides, setPlayerOverrides] = useState<Array<{ raw_name: string; player_id: number; player_name: string }>>([]);

  const streamAbortRef = useRef<(() => void) | null>(null);


  useEffect(() => {
    if (!isOpen || !jobId || !leagueId || status === JOB_STATUS.COMPLETED || status === JOB_STATUS.FAILED) {
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
        setStatus(data.status || JOB_STATUS.COMPLETED);
        if (data.status === JOB_STATUS.COMPLETED && data.result) {
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
        } else if (data.status === JOB_STATUS.FAILED) {
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

  // State reset on new initialJobId is handled by the parent re-keying the
  // component (key={initialJobId} in GlobalModal), which remounts the hook.

  const handleClose = useCallback(async () => {
    if (isSubmitting) return;

    if (sessionId && status !== JOB_STATUS.CONFIRMED) {
      try {
        await cancelPhotoSession(leagueId, String(sessionId));
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
      const response = await editPhotoResults(leagueId, String(sessionId), editPrompt.trim());
      setJobId(response.job_id);
      setStatus(JOB_STATUS.PENDING);
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
  const handleResolvePlayer = useCallback((rawName: any, playerId: any, playerName: any) => {
    // Upsert into overrides
    setPlayerOverrides((prev) => {
      const filtered = prev.filter((o) => o.raw_name !== rawName);
      return [...filtered, { raw_name: rawName, player_id: playerId, player_name: playerName }];
    });

    // Update result.matches in state so table shows resolved names immediately
    setResult((prev: any) => {
      if (!prev?.matches) return prev;
      const playerFields = ['team1_player1', 'team1_player2', 'team2_player1', 'team2_player2'];
      const updatedMatches = prev.matches.map((match: any) => {
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

      // If all players are now resolved, clear needs_clarification status
      const allResolved = updatedMatches.every((match: any) =>
        playerFields.every((field) => {
          if (match[`${field}_id`]) return true;
          const player = match[field];
          return typeof player === 'object' && !!player?.id;
        })
      );

      const updated = { ...prev, matches: updatedMatches };
      if (allResolved && prev.status === 'needs_clarification') {
        updated.status = 'success';
        updated.clarification_question = null;
      }
      return updated;
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
    const isPlayerMatched = (player: any, playerId: any) => {
      if (typeof player === 'object' && player?.id) return true;
      if (playerId) return true;
      return false;
    };

    const hasUnmatched = result.matches.some(
      (match: any) =>
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
        String(sessionId),
        selectedSeasonId,
        matchDate,
        overridesPayload
      );
      setStatus(JOB_STATUS.CONFIRMED);
      onSuccess?.(response.match_ids, selectedSeasonId);
    } catch (err) {
      console.error('Error confirming matches:', err);
      const detail = err.response?.data?.detail;
      const errorMsg = Array.isArray(detail)
        ? detail.map((e) => e.msg).join('; ')
        : detail || 'Failed to create games';
      setError(errorMsg);
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
