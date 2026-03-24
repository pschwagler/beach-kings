'use client';

import { useState, useCallback, useMemo } from 'react';
import { calculateWinner } from '../components/league/utils/matchUtils';

const PENDING_ID_PREFIX = 'pending-';

/** Check if a match ID is a pending (not-yet-persisted) entry. */
const isPendingId = (id: number | string): id is string =>
  typeof id === 'string' && id.startsWith(PENDING_ID_PREFIX);

/** Extract the array index from a pending ID string. */
const parsePendingIndex = (id: string): number => parseInt(id.slice(PENDING_ID_PREFIX.length), 10);

/**
 * Buffer state machine for pickup session edit mode.
 *
 * Tracks pending match changes (adds, edits, deletes) locally so the UI can
 * preview them without touching the API. On save, `flush()` applies them in
 * bulk: deletes → updates → creates → lockInSession.
 *
 * Mirrors the proven buffer shape from useSessionEditing.js (league system).
 */
export function useEditBuffer() {
  // modified: Map<matchId, payload>  — edits to existing (or pending) matches
  // added: [payload]                 — new matches not yet persisted
  // deleted: Set<matchId>            — real match IDs to remove on flush
  const [modified, setModified] = useState(new Map<number | string, any>());
  const [added, setAdded] = useState<any[]>([]);
  const [deleted, setDeleted] = useState(new Set<number | string>());

  /** True when the buffer contains any pending changes. */
  const isDirty = useMemo(
    () => modified.size > 0 || added.length > 0 || deleted.size > 0,
    [modified, added, deleted],
  );

  /**
   * Buffer an edit to an existing or pending match.
   * @param {number|string} matchId - Real ID or `pending-*` temp ID
   * @param {Object} payload - Match payload from AddMatchModal
   */
  const bufferEdit = useCallback((matchId: number | string, payload: any) => {
    if (isPendingId(matchId)) {
      // Editing a just-added match — update in `added` array in-place
      const index = parsePendingIndex(matchId);
      setAdded((prev) => {
        if (isNaN(index) || index < 0 || index >= prev.length) return prev;
        const next = [...prev];
        next[index] = payload;
        return next;
      });
    } else {
      // Editing a real persisted match
      setModified((prev) => {
        const next = new Map(prev);
        next.set(matchId, payload);
        return next;
      });
    }
  }, []);

  /**
   * Buffer a new match addition.
   * Assigns a temp `pending-{index}` ID (index = position in added array).
   * @param {Object} payload - Match payload from AddMatchModal
   */
  const bufferAdd = useCallback((payload: any) => {
    setAdded((prev) => [...prev, payload]);
  }, []);

  /**
   * Buffer a match deletion.
   * - Real IDs → added to `deleted` set (and removed from `modified` if present)
   * - Pending IDs → removed from `added` array
   * @param {number|string} matchId
   */
  const bufferDelete = useCallback((matchId: number | string) => {
    if (isPendingId(matchId)) {
      const index = parsePendingIndex(matchId);
      setAdded((prev) => {
        if (isNaN(index) || index < 0 || index >= prev.length) return prev;
        return prev.filter((_, i) => i !== index);
      });
    } else {
      // Real match — track for deletion on flush
      setDeleted((prev) => {
        const next = new Set(prev);
        next.add(matchId);
        return next;
      });
      // Clean up any buffered edit for this match
      setModified((prev) => {
        if (!prev.has(matchId)) return prev;
        const next = new Map(prev);
        next.delete(matchId);
        return next;
      });
    }
  }, []);

  /** Reset all buffer state. */
  const clearBuffer = useCallback(() => {
    setModified(new Map());
    setAdded([]);
    setDeleted(new Set());
  }, []);

  /**
   * Flush buffered changes to the API.
   * Order: deletes → updates → creates → lockInSession.
   *
   * @param {number} sessionId
   * @param {Object} ops - API operation callbacks
   * @param {Function} ops.deleteMatchAPI  - (matchId) => Promise
   * @param {Function} ops.updateMatchAPI  - (matchId, payload) => Promise
   * @param {Function} ops.createMatchAPI  - (payload) => Promise
   * @param {Function} ops.lockInSessionAPI - (sessionId) => Promise
   * @returns {Promise<void>}
   */
  const flush = useCallback(
    async (
      sessionId: number,
      {
        deleteMatchAPI,
        updateMatchAPI,
        createMatchAPI,
        lockInSessionAPI,
      }: {
        deleteMatchAPI: (matchId: number | string) => Promise<any>;
        updateMatchAPI: (matchId: number | string, payload: any) => Promise<any>;
        createMatchAPI: (payload: any) => Promise<any>;
        lockInSessionAPI: (sessionId: number) => Promise<any>;
      },
    ) => {
      // Deletes first
      for (const matchId of deleted as Set<number | string>) {
        await deleteMatchAPI(matchId);
      }
      // Updates
      for (const [matchId, payload] of modified as Map<number | string, any>) {
        await updateMatchAPI(matchId, payload);
      }
      // Creates
      for (const payload of added) {
        await createMatchAPI({ ...payload, session_id: sessionId });
      }
      // Lock in / recalculate stats
      await lockInSessionAPI(sessionId);
    },
    [deleted, modified, added],
  );

  return {
    buffer: { modified, added, deleted },
    isDirty,
    bufferEdit,
    bufferAdd,
    bufferDelete,
    clearBuffer,
    flush,
  };
}

/**
 * Merge buffered changes with the current transformed matches for display.
 *
 * Mirrors `matchesWithPendingChanges` from MatchesTable.jsx:
 * 1. Filter out deleted IDs
 * 2. Overlay modified fields + recalculate winner
 * 3. Append added entries with `pending-*` IDs
 *
 * @param {Array} matches - transformedMatches in display format
 * @param {{ modified: Map, added: Array, deleted: Set }} buffer
 * @param {Map<number,string>} participantLookup - player_id → full_name
 * @returns {Array} merged matches for display
 */
export function mergeBufferWithMatches(
  matches: any[],
  buffer: { modified: Map<any, any>; added: any[]; deleted: Set<any> },
  participantLookup: Map<number, string>,
): any[] {
  const { modified, added, deleted } = buffer;
  if (modified.size === 0 && added.length === 0 && deleted.size === 0) {
    return matches;
  }

  // 1. Filter deleted
  let result = deleted.size > 0
    ? matches.filter((m) => !deleted.has(m.id))
    : [...matches];

  // Helper: resolve a player ID (or name string) to a display name
  const resolveName = (idOrName: number | string | null | undefined): string => {
    if (!idOrName) return '';
    if (typeof idOrName === 'string' && !/^\d+$/.test(idOrName)) return idOrName;
    return participantLookup.get(Number(idOrName)) || '';
  };

  // 2. Overlay modified
  if (modified.size > 0) {
    result = result.map((match) => {
      const payload = modified.get(match.id);
      if (!payload) return match;

      const team1Score = payload.team1_score !== undefined ? payload.team1_score : match['Team 1 Score'];
      const team2Score = payload.team2_score !== undefined ? payload.team2_score : match['Team 2 Score'];

      return {
        ...match,
        'Team 1 Player 1': payload.team1_player1_id ? resolveName(payload.team1_player1_id) : match['Team 1 Player 1'],
        'Team 1 Player 2': payload.team1_player2_id ? resolveName(payload.team1_player2_id) : match['Team 1 Player 2'],
        'Team 2 Player 1': payload.team2_player1_id ? resolveName(payload.team2_player1_id) : match['Team 2 Player 1'],
        'Team 2 Player 2': payload.team2_player2_id ? resolveName(payload.team2_player2_id) : match['Team 2 Player 2'],
        'Team 1 Score': team1Score,
        'Team 2 Score': team2Score,
        Winner: calculateWinner(team1Score, team2Score),
      };
    });
  }

  // 3. Append added entries with pending-* IDs
  added.forEach((payload, index) => {
    result.push({
      id: `${PENDING_ID_PREFIX}${index}`,
      Date: new Date().toISOString().split('T')[0],
      'Session ID': payload.session_id ?? null,
      'Session Name': '',
      'Session Status': 'ACTIVE',
      'Team 1 Player 1': resolveName(payload.team1_player1_id),
      'Team 1 Player 2': resolveName(payload.team1_player2_id),
      'Team 2 Player 1': resolveName(payload.team2_player1_id),
      'Team 2 Player 2': resolveName(payload.team2_player2_id),
      'Team 1 Score': payload.team1_score,
      'Team 2 Score': payload.team2_score,
      Winner: calculateWinner(payload.team1_score, payload.team2_score),
      'Team 1 ELO Change': 0,
      'Team 2 ELO Change': 0,
    });
  });

  return result;
}
