import { useState, useCallback } from 'react';
import { lockInLeagueSession } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';
import type { DisplayMatch } from '../utils/matchUtils';

/** Metadata captured when entering edit mode for a session. */
interface SessionEditMetadata {
  id: number;
  name: string;
  status: string;
  createdAt: string | null | undefined;
  updatedAt: string | null | undefined;
  createdBy: string | null | undefined;
  updatedBy: string | null | undefined;
}

/** Pending changes for a single session being edited. */
interface SessionPendingChanges {
  updates: Map<number, Partial<DisplayMatch>>;
  additions: Partial<DisplayMatch>[];
  deletions: number[];
}

/** API operations bundle passed to save/create/update/delete handlers. */
interface MatchOperations {
  deleteMatchAPI: (matchId: number | string, opts?: Record<string, unknown>) => Promise<void>;
  updateMatchAPI: (matchId: number | string, matchData: Partial<DisplayMatch>, opts?: Record<string, unknown>) => Promise<void>;
  createMatchAPI: (matchData: Partial<DisplayMatch>, opts?: Record<string, unknown>) => Promise<void>;
  normalizeMatchData?: (matchData: Partial<DisplayMatch>) => Partial<DisplayMatch>;
}

interface UseSessionEditingParams {
  matches: DisplayMatch[] | null | undefined;
  leagueId: number | null | undefined;
  refreshData: ((opts?: Record<string, any>) => Promise<void>) | null | undefined;
  refreshSeasonData: ((seasonId: number) => Promise<void>) | null | undefined;
  getSeasonIdForRefresh: (() => number | null) | null | undefined;
}

/**
 * Hook to manage session editing state and pending changes
 * Tracks which sessions are being edited and stores pending match changes
 */
export function useSessionEditing({
  matches,
  leagueId,
  refreshData,
  refreshSeasonData,
  getSeasonIdForRefresh,
}: UseSessionEditingParams) {
  const { showToast } = useToast();
  const [editingSessions, setEditingSessions] = useState<Set<number>>(new Set());
  const [pendingMatchChanges, setPendingMatchChanges] = useState<Map<number, SessionPendingChanges>>(new Map());
  const [editingSessionMetadata, setEditingSessionMetadata] = useState<Map<number, SessionEditMetadata>>(new Map());

  /**
   * Check if a session is currently being edited
   */
  const isEditing = useCallback((sessionId: number) => {
    return editingSessions.has(sessionId);
  }, [editingSessions]);

  /**
   * Enter edit mode for a session
   * Initializes pending changes and stores session metadata
   */
  const enterEditMode = useCallback((sessionId: number, currentMatches: DisplayMatch[] | null) => {
    const matchesToUse = currentMatches || matches;
    setEditingSessions(prev => new Set(prev).add(sessionId));

    // Initialize pending changes for this session
    setPendingMatchChanges(prev => {
      const next = new Map(prev);
      if (!next.has(sessionId)) {
        next.set(sessionId, { updates: new Map<number, Partial<DisplayMatch>>(), additions: [], deletions: [] });
      }
      return next;
    });

    // Store session metadata so we can show the session even if all matches are deleted
    const sessionMatch = matchesToUse?.find((m: DisplayMatch) => m.session_id === sessionId);
    if (sessionMatch) {
      setEditingSessionMetadata(prev => {
        const next = new Map(prev);
        next.set(sessionId, {
          id: sessionId,
          name: sessionMatch.session_name || `Session ${sessionId}`,
          status: sessionMatch.session_status || 'SUBMITTED',
          createdAt: sessionMatch.session_created_at,
          updatedAt: sessionMatch.session_updated_at,
          createdBy: sessionMatch.session_created_by,
          updatedBy: sessionMatch.session_updated_by,
        });
        return next;
      });
    }
  }, [matches]);

  /**
   * Cancel edit mode for a session
   * Discards all pending changes
   */
  const cancelEdit = useCallback((sessionId: number) => {
    setEditingSessions(prev => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
    
    // Discard pending changes for this session
    setPendingMatchChanges(prev => {
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
    
    setEditingSessionMetadata(prev => {
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
    
    // Reload matches to discard any local changes
    if (refreshData) {
      refreshData({ matches: true });
    }
  }, [refreshData]);

  /**
   * Save edited session
   * Applies all pending changes and locks in the session
   */
  const saveEditedSession = useCallback(async (sessionId: number, matchOperations: MatchOperations) => {
    try {
      // Apply all pending match changes for this session
      const sessionChanges = pendingMatchChanges.get(sessionId);
      
      if (sessionChanges && matchOperations) {
        // Skip individual refreshes during batch operations to prevent duplicate matches
        // We'll do a single refresh at the end after clearing pending changes
        const skipRefresh = { skipRefresh: true };
        
        // Apply deletions first (before updates/additions)
        if (sessionChanges.deletions && sessionChanges.deletions.length > 0) {
          for (const matchId of sessionChanges.deletions) {
            await matchOperations.deleteMatchAPI(matchId, skipRefresh);
          }
        }
        
        // Apply updates
        for (const [matchId, matchData] of sessionChanges.updates) {
          await matchOperations.updateMatchAPI(matchId, matchData, skipRefresh);
        }
        
        // Apply additions
        for (const matchData of sessionChanges.additions) {
          await matchOperations.createMatchAPI(matchData, skipRefresh);
        }
      } else {
        console.warn('[useSessionEditing.saveEditedSession] No sessionChanges or matchOperations:', {
          hasSessionChanges: !!sessionChanges,
          hasMatchOperations: !!matchOperations
        });
      }
      
      // Lock in the session (this will recalculate stats)
      await lockInLeagueSession(leagueId, sessionId);
      
      // Clear editing state and pending changes IMMEDIATELY after API operations
      // This prevents duplicate matches from showing (pending + real matches)
      // Must be done before any refresh operations
      setEditingSessions(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      setPendingMatchChanges(prev => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      setEditingSessionMetadata(prev => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      
      // Schedule delayed stats refresh after backend has time to recalculate
      // This allows the async stat calculation job to complete
      if (refreshSeasonData && getSeasonIdForRefresh) {
        const seasonId = getSeasonIdForRefresh();
        if (seasonId) {
          setTimeout(() => {
            try {
              refreshSeasonData(seasonId);
            } catch (error) {
              console.error('[useSessionEditing.saveEditedSession] Error refreshing stats:', error);
              // Don't throw - stats refresh failure shouldn't affect session operation
            }
          }, 2000);
        }
      }
      
      // Refresh all data
      if (refreshData) {
        await refreshData({ sessions: true, season: true, matches: true });
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to save session', 'error');
      throw err;
    }
  }, [pendingMatchChanges, leagueId, refreshData, refreshSeasonData, getSeasonIdForRefresh, showToast]);

  /**
   * Add a pending match to a session being edited
   */
  const addPendingMatch = useCallback((sessionId: number, matchData: Partial<DisplayMatch>) => {
    setPendingMatchChanges(prev => {
      const next = new Map(prev);
      const sessionChanges: SessionPendingChanges = next.get(sessionId) || { updates: new Map<number, Partial<DisplayMatch>>(), additions: [] as Partial<DisplayMatch>[], deletions: [] as number[] };
      sessionChanges.additions.push(matchData);
      next.set(sessionId, sessionChanges);
      return next;
    });
  }, []);

  /**
   * Update a pending match in a session being edited
   */
  const updatePendingMatch = useCallback((sessionId: number, matchId: number | string, matchData: Partial<DisplayMatch>) => {
    setPendingMatchChanges(prev => {
      const next = new Map(prev);
      const sessionChanges: SessionPendingChanges = next.get(sessionId) || { updates: new Map<number, Partial<DisplayMatch>>(), additions: [] as Partial<DisplayMatch>[], deletions: [] as number[] };
      
      // Check if this is a pending match (newly added match being edited)
      if (typeof matchId === 'string' && matchId.startsWith('pending-')) {
        // Extract index from temp ID: pending-{sessionId}-{index}
        const parts = matchId.split('-');
        if (parts.length >= 3) {
          const index = parseInt(parts[2]);
          if (!isNaN(index) && index >= 0 && index < sessionChanges.additions.length) {
            // Update the addition in place
            sessionChanges.additions[index] = matchData;
          } else {
            // Index not found, add as new addition
            sessionChanges.additions.push(matchData);
          }
        } else {
          // Invalid temp ID format, add as new addition
          sessionChanges.additions.push(matchData);
        }
      } else {
        // Existing match being edited - store in updates
        sessionChanges.updates.set(matchId as number, matchData);
      }
      
      next.set(sessionId, sessionChanges);
      return next;
    });
  }, []);

  /**
   * Delete a pending match from a session being edited
   */
  const deletePendingMatch = useCallback((sessionId: number, matchId: number | string) => {
    // Check if this is a pending match (newly added match that hasn't been saved)
    if (typeof matchId === 'string' && matchId.startsWith('pending-')) {
      // Extract sessionId and index from temp ID: pending-{sessionId}-{index}
      const parts = matchId.split('-');
      if (parts.length >= 3) {
        const sessionIdFromId = parseInt(parts[1]);
        const index = parseInt(parts[2]);
        if (!isNaN(sessionIdFromId) && !isNaN(index) && index >= 0) {
          // Remove from pending additions
          setPendingMatchChanges(prev => {
            const next = new Map(prev);
            const sessionChanges = next.get(sessionIdFromId);
            if (sessionChanges && index < sessionChanges.additions.length) {
              // Remove the addition at this index
              sessionChanges.additions.splice(index, 1);
              next.set(sessionIdFromId, sessionChanges);
            }
            return next;
          });
          return;
        }
      }
      // Invalid pending ID format, just return (match was never saved)
      return;
    }
    
    // Existing match - track deletion in pending changes
    setPendingMatchChanges(prev => {
      const next = new Map(prev);
      const sessionChanges: SessionPendingChanges = next.get(sessionId) || { updates: new Map<number, Partial<DisplayMatch>>(), additions: [] as Partial<DisplayMatch>[], deletions: [] as number[] };
      
      // Remove from updates if it was being updated
      sessionChanges.updates.delete(matchId as number);

      // Add to deletions list
      if (!sessionChanges.deletions) {
        sessionChanges.deletions = [];
      }
      if (!sessionChanges.deletions.includes(matchId as number)) {
        sessionChanges.deletions.push(matchId as number);
      }
      
      next.set(sessionId, sessionChanges);
      return next;
    });
  }, []);

  /**
   * Router function: Create match - routes to pending changes or API
   */
  const handleCreateMatch = useCallback(async (matchData: Partial<DisplayMatch> & { session_id?: number }, sessionId: number | null | undefined, matchOperations: MatchOperations | null) => {
    // Determine which session ID to check (from parameter or matchData)
    const sessionIdToCheck = sessionId || matchData?.session_id;
    
    // If editing this session, store locally
    if (sessionIdToCheck && isEditing(sessionIdToCheck)) {
      addPendingMatch(sessionIdToCheck, matchData);
      return;
    }
    
    // Otherwise, call API immediately
    if (matchOperations) {
      await matchOperations.createMatchAPI(matchData);
    } else {
      console.error('[useSessionEditing.handleCreateMatch] ERROR: matchOperations is not available for match creation');
    }
  }, [isEditing, addPendingMatch]);

  /**
   * Router function: Update match - routes to pending changes or API
   */
  const handleUpdateMatch = useCallback(async (matchId: number | string, matchData: Partial<DisplayMatch>, sessionId: number | null | undefined, matchOperations: MatchOperations | null, matches: DisplayMatch[]) => {
    // Find session ID if not provided
    if (!sessionId) {
      const match = matches?.find((m: DisplayMatch) => m.id === matchId);
      sessionId = match?.session_id;
    }
    
    // Normalize match data first
    let normalizedData = matchData;
    if (matchOperations?.normalizeMatchData) {
      normalizedData = matchOperations.normalizeMatchData(matchData);
    }
    
    // If editing this session, store locally
    if (sessionId && isEditing(sessionId)) {
      updatePendingMatch(sessionId, matchId, normalizedData);
      return;
    }
    
    // Otherwise, call API immediately
    if (matchOperations) {
      await matchOperations.updateMatchAPI(matchId, normalizedData);
    }
  }, [isEditing, updatePendingMatch]);

  /**
   * Router function: Delete match - routes to pending changes or API
   */
  const handleDeleteMatch = useCallback(async (matchId: number | string, matchOperations: MatchOperations | null, matches: DisplayMatch[]) => {
    // Check if pending match
    if (typeof matchId === 'string' && matchId.startsWith('pending-')) {
      // Extract sessionId from temp ID: pending-{sessionId}-{index}
      const parts = matchId.split('-');
      if (parts.length >= 3) {
        const sessionId = parseInt(parts[1]);
        if (!isNaN(sessionId)) {
          deletePendingMatch(sessionId, matchId);
          return;
        }
      }
      // Invalid pending ID format, just return (match was never saved)
      return;
    }

    // Find session ID
    const match = matches?.find((m: DisplayMatch) => m.id === matchId);
    const sessionId = match?.session_id;
    
    // If editing this session, store locally
    if (sessionId && isEditing(sessionId)) {
      deletePendingMatch(sessionId, matchId);
      return;
    }
    
    // Otherwise, call API immediately
    if (matchOperations) {
      await matchOperations.deleteMatchAPI(matchId);
    }
  }, [isEditing, deletePendingMatch]);

  return {
    editingSessions,
    pendingMatchChanges,
    editingSessionMetadata,
    isEditing,
    enterEditMode,
    cancelEdit,
    saveEditedSession,
    addPendingMatch,
    updatePendingMatch,
    deletePendingMatch,
    handleCreateMatch,
    handleUpdateMatch,
    handleDeleteMatch
  };
}


