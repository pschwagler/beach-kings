import { useState, useMemo } from 'react';
import { Edit2, Trophy, Users, AlertCircle, Check, X } from 'lucide-react';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { formatRelativeTime } from '../../utils/dateUtils';
import { useLeague } from '../../contexts/LeagueContext';

// Helper to calculate winner (copied from MatchesTable)
function calculateWinner(team1Score, team2Score) {
  if (team1Score > team2Score) return 'Team 1';
  if (team1Score < team2Score) return 'Team 2';
  return 'Tie';
}

// Helper to create session group (copied from MatchesTable)
function createSessionGroup(sessionId, sessionName, sessionStatus, sessionCreatedAt, sessionUpdatedAt, sessionCreatedBy, sessionUpdatedBy) {
  return {
    type: 'session',
    id: sessionId,
    name: sessionName,
    status: sessionStatus,
    isActive: sessionStatus === 'ACTIVE',
    createdAt: sessionCreatedAt,
    updatedAt: sessionUpdatedAt,
    createdBy: sessionCreatedBy,
    updatedBy: sessionUpdatedBy,
    lastUpdated: sessionUpdatedAt || sessionCreatedAt,
    matches: []
  };
}

export default function MatchesClipboardView({
  matches,
  onPlayerClick,
  loading,
  activeSession,
  allSessions = [],
  onCreateSession,
  onEndSession,
  onDeleteSession,
  onCreateMatch,
  onUpdateMatch,
  onDeleteMatch,
  allPlayerNames,
  playerIdToName = new Map(),
  leagueId = null,
  isAdmin = false,
  editingSessions = new Set(),
  onEnterEditMode,
  onSaveEditedSession,
  onCancelEdit,
  pendingMatchChanges = new Map(),
  editingSessionMetadata = new Map(),
  seasons = [],
  selectedSeasonId = null,
  onUpdateSessionSeason = null,
  activeSessionMatchesOverride = null,
  onSeasonChange = null
}) {
    const { isLeagueMember, members, league } = useLeague();
    const { openModal } = useModal();

    // --- Data Preparation Logic (Copied/Adapted from MatchesTable) ---

    // 1. Process Pending Changes
    const matchesWithPendingChanges = useMemo(() => {
        if (matches === null) return null;
        if (pendingMatchChanges.size === 0) return matches;

        let updatedMatches = [...matches];

        pendingMatchChanges.forEach((sessionChanges, sessionId) => {
            if (sessionChanges.deletions?.length > 0) {
                updatedMatches = updatedMatches.filter(m => !sessionChanges.deletions.includes(m.id));
            }

            sessionChanges.updates.forEach((updatedData, matchId) => {
                const matchIndex = updatedMatches.findIndex(m => m.id === matchId);
                if (matchIndex !== -1) {
                    const match = updatedMatches[matchIndex];
                    const team1Score = updatedData.team1_score !== undefined ? updatedData.team1_score : match['Team 1 Score'];
                    const team2Score = updatedData.team2_score !== undefined ? updatedData.team2_score : match['Team 2 Score'];

                    updatedMatches[matchIndex] = {
                        ...match,
                        'Team 1 Player 1': updatedData.team1_player1 || match['Team 1 Player 1'],
                        'Team 1 Player 2': updatedData.team1_player2 || match['Team 1 Player 2'],
                        'Team 2 Player 1': updatedData.team2_player1 || match['Team 2 Player 1'],
                        'Team 2 Player 2': updatedData.team2_player2 || match['Team 2 Player 2'],
                        'Team 1 Score': team1Score,
                        'Team 2 Score': team2Score,
                        Winner: calculateWinner(team1Score, team2Score)
                    };
                }
            });

            sessionChanges.additions.forEach((newMatchData, index) => {
                const sessionMatch = updatedMatches.find(m => m['Session ID'] === sessionId);
                const sessionName = sessionMatch?.['Session Name'] || 'New Session';

                const getPlayerName = (playerId) => {
                    if (!playerId) return '';
                    if (typeof playerId === 'string' && !/^\d+$/.test(playerId)) {
                        return playerId;
                    }
                    return playerIdToName.get(Number(playerId)) || '';
                };

                const pendingMatch = {
                    id: `pending-${sessionId}-${index}`,
                    Date: new Date().toISOString().split('T')[0],
                    'Session ID': sessionId,
                    'Session Name': sessionName,
                    'Session Status': 'ACTIVE',
                    'Team 1 Player 1': getPlayerName(newMatchData.team1_player1_id || newMatchData.team1_player1),
                    'Team 1 Player 2': getPlayerName(newMatchData.team1_player2_id || newMatchData.team1_player2),
                    'Team 2 Player 1': getPlayerName(newMatchData.team2_player1_id || newMatchData.team2_player1),
                    'Team 2 Player 2': getPlayerName(newMatchData.team2_player2_id || newMatchData.team2_player2),
                    'Team 1 Score': newMatchData.team1_score,
                    'Team 2 Score': newMatchData.team2_score,
                    Winner: calculateWinner(newMatchData.team1_score, newMatchData.team2_score),
                    'Team 1 ELO Change': 0,
                    'Team 2 ELO Change': 0,
                };
                updatedMatches.push(pendingMatch);
            });
        });

        return updatedMatches;
    }, [matches, pendingMatchChanges, playerIdToName]);

    // 2. Session Map
    const sessionsMap = useMemo(() => {
        const map = new Map();
        allSessions.forEach(session => {
            map.set(session.id, session);
        });
        return map;
    }, [allSessions]);

    // 3. Group Matches by Session
    const matchesBySession = useMemo(() => {
        if (matchesWithPendingChanges === null) return {};

        const grouped = matchesWithPendingChanges.reduce((acc, match) => {
            const sessionId = match['Session ID'];

            if (sessionId != null) {
                const key = `session-${sessionId}`;
                if (!acc[key]) {
                    const sessionData = sessionsMap.get(sessionId);
                    const sessionCreatedAt = sessionData?.created_at || match['Session Created At'];
                    const sessionName = sessionData?.name || match['Session Name'];
                    const sessionStatus = sessionData?.status || match['Session Status'];

                    acc[key] = createSessionGroup(
                        sessionId,
                        sessionName,
                        sessionStatus,
                        sessionCreatedAt,
                        match['Session Updated At'],
                        match['Session Created By'],
                        match['Session Updated By']
                    );
                }
                acc[key].matches.push(match);
                
                // Update helpers
                const status = match['Session Status'];
                if (status) {
                    acc[key].status = status;
                    acc[key].isActive = status === 'ACTIVE';
                }
                if (match['Session Updated By']) acc[key].updatedBy = match['Session Updated By'];
                if (match['Session Updated At']) {
                    acc[key].updatedAt = match['Session Updated At'];
                    acc[key].lastUpdated = match['Session Updated At'];
                }
            } else {
                // Fallback for matches without session ID (shouldn't happen often in new system)
                const key = `date-${match.Date}`;
                if (!acc[key]) {
                    acc[key] = {
                        type: 'date',
                        name: match.Date,
                        createdAt: null,
                        lastUpdated: null,
                        createdBy: null,
                        updatedBy: null,
                        matches: []
                    };
                }
                acc[key].matches.push(match);
            }
            return acc;
        }, {});

        // Add empty editing sessions if not present
        editingSessions.forEach(sessionId => {
            const key = `session-${sessionId}`;
            if (!grouped[key]) {
                 const sessionMetadata = editingSessionMetadata.get(sessionId);
                 if (sessionMetadata) {
                    const sessionData = sessionsMap.get(sessionId);
                    const sessionCreatedAt = sessionData?.created_at || sessionMetadata.createdAt;
                    grouped[key] = createSessionGroup(
                        sessionId,
                        sessionMetadata.name || `Session ${sessionId}`,
                        sessionMetadata.status || 'SUBMITTED',
                        sessionCreatedAt,
                        sessionMetadata.updatedAt,
                        sessionMetadata.createdBy,
                        sessionMetadata.updatedBy
                    );
                 } else {
                     // Try to find from matches if metadata missing (fallback)
                     const sessionMatch = matches?.find(m => m['Session ID'] === sessionId);
                     if (sessionMatch) {
                        const sessionData = sessionsMap.get(sessionId);
                        const sessionCreatedAt = sessionData?.created_at || sessionMatch['Session Created At'];
                        grouped[key] = createSessionGroup(
                             sessionId,
                             sessionMatch['Session Name'] || `Session ${sessionId}`,
                             sessionMatch['Session Status'] || 'SUBMITTED',
                             sessionCreatedAt,
                             sessionMatch['Session Updated At'],
                             sessionMatch['Session Created By'],
                             sessionMatch['Session Updated By']
                         );
                     }
                 }
            }
        });

        return grouped;
    }, [matchesWithPendingChanges, editingSessions, editingSessionMetadata, matches, sessionsMap]);

    // 4. Sort Groups (Newest first)
    const sessionGroups = useMemo(() => {
        return Object.entries(matchesBySession).sort(([keyA, groupA], [keyB, groupB]) => {
            const dateA = groupA.createdAt || groupA.lastUpdated;
            const dateB = groupB.createdAt || groupB.lastUpdated;

            if (dateA && dateB) {
                const timeDiff = new Date(dateB) - new Date(dateA);
                if (timeDiff !== 0) return timeDiff;
            }
            if (dateA && !dateB) return -1;
            if (!dateA && dateB) return 1;
            return groupB.name.localeCompare(groupA.name);
        });
    }, [matchesBySession]);

    // 5. Active Session Data
    const activeSessionMatches = useMemo(() => {
        if (!activeSession) return [];
        if (activeSessionMatchesOverride) {
            return activeSessionMatchesOverride.filter(match => match['Session ID'] === activeSession.id);
        }
        if (!matchesWithPendingChanges) return [];
        return matchesWithPendingChanges.filter(match => match['Session ID'] === activeSession.id);
    }, [activeSession, matchesWithPendingChanges, activeSessionMatchesOverride]);

    const activeSessionGameCount = activeSessionMatches.length;

    // --- Render Logic ---

    if (loading || matches === null) {
        // You might want to use a Skeleton here, or just basic loading
        return <div style={{ padding: '20px', textAlign: 'center' }}>Loading clipboard view...</div>;
    }

    if (!isLeagueMember) {
        return <div className="league-error">Access Denied</div>;
    }

    // Sort matches within groups
    Object.values(matchesBySession).forEach(group => {
        if (group.matches?.length > 0) {
            // Sort by ID is usually fine for display order
            group.matches.sort((a, b) => (a.id || 0) - (b.id || 0));
        }
    });

    // Handlers for Add/Edit
    const handleEditMatch = (match) => {
        openModal(MODAL_TYPES.ADD_MATCH, {
            editMatch: match,
            onSubmit: async (matchData, matchId) => {
                 // Wrapper to match MatchesTable signature
                 if (matchId) {
                     const m = matchesWithPendingChanges.find(m => m.id === matchId);
                     const sessionId = m?.['Session ID'];
                     const isEditingSession = sessionId && editingSessions.has(sessionId);
                     await onUpdateMatch(matchId, matchData, isEditingSession ? sessionId : undefined);
                 } else {
                     // Should not be called from edit match, but just in case
                     console.error("Create match called from edit handler");
                 }
            },
            onDelete: onDeleteMatch,
            allPlayerNames,
            leagueMatchOnly: !!leagueId,
            defaultLeagueId: leagueId,
            members,
            league,
            defaultSeasonId: selectedSeasonId,
            onSeasonChange: onSeasonChange
        });
    };

    const handleAddMatchToSession = (sessionId, sessionSeasonId) => {
         openModal(MODAL_TYPES.ADD_MATCH, {
            onSubmit: async (matchData) => {
                const matchPayload = { ...matchData, session_id: sessionId };
                await onCreateMatch(matchPayload, sessionId); // Pass sessionId to indicate it's for an open session
            },
            onDelete: onDeleteMatch,
            allPlayerNames,
            leagueMatchOnly: !!leagueId,
            defaultLeagueId: leagueId,
            members,
            league,
            sessionId: sessionId,
            sessionSeasonId: sessionSeasonId,
            defaultSeasonId: selectedSeasonId,
            onSeasonChange: onSeasonChange
        });
    };

    // Render a single session table
    const renderSessionTable = (group, isActive = false, isEditing = false) => {
        const canEditSession = isAdmin && group.type === 'session' && 
                             (group.status === 'SUBMITTED' || group.status === 'EDITED') && 
                             !isEditing && !isActive;

        // Check if this is the active session - if so, allow adding matches
        // Also allow adding matches if it's in edit mode
        const canAddMatches = isActive || isEditing;
        
        // Calculate players in session
        const sessionPlayers = new Set();
        group.matches.forEach(m => {
             if (m['Team 1 Player 1']) sessionPlayers.add(m['Team 1 Player 1']);
             if (m['Team 1 Player 2']) sessionPlayers.add(m['Team 1 Player 2']);
             if (m['Team 2 Player 1']) sessionPlayers.add(m['Team 2 Player 1']);
             if (m['Team 2 Player 2']) sessionPlayers.add(m['Team 2 Player 2']);
        });

        // Get season info
        const sessionMatch = group.matches && group.matches.length > 0 ? group.matches[0] : null;
        let seasonId = sessionMatch?.['Session Season ID'];
        if (isActive && activeSession?.season_id) seasonId = activeSession.season_id;
        
        const sessionSeason = seasonId && seasons.find(s => s.id === seasonId);

        return (
            <div className={`clipboard-session-card ${isActive ? 'active-session' : ''} ${isEditing ? 'editing-session' : ''}`} key={group.id}>
                <div className="clipboard-header">
                    <div className="clipboard-header-left">
                        <h3 className="clipboard-title">
                            {group.name}
                            {sessionSeason && (
                                <span className="season-badge">{sessionSeason.name}</span>
                            )}
                            {isActive && <span className="status-badge active">Active</span>}
                            {isEditing && <span className="status-badge editing">Editing</span>}
                        </h3>
                        <div className="clipboard-meta">
                            <span><Trophy size={14} /> {group.matches.length} matches</span>
                            <span><Users size={14} /> {sessionPlayers.size} players</span>
                            {group.lastUpdated && !isActive && !isEditing && (
                                <span className="timestamp">{formatRelativeTime(group.lastUpdated)}</span>
                            )}
                        </div>
                    </div>
                    <div className="clipboard-actions">
                        {canEditSession && (
                            <button 
                                className="icon-button" 
                                onClick={() => onEnterEditMode(group.id)}
                                title="Edit Session"
                            >
                                <Edit2 size={16} />
                            </button>
                        )}
                        {isEditing && (
                            <div className="edit-actions">
                                <button className="league-text-button secondary small" onClick={() => onCancelEdit(group.id)}>Cancel</button>
                                <button className="league-text-button primary small" onClick={() => onSaveEditedSession(group.id)}>Save</button>
                            </div>
                        )}
                        {isActive && (
                            <div className="active-actions">
                                <button 
                                    className="league-text-button primary small"
                                    onClick={() => {
                                        openModal(MODAL_TYPES.CONFIRMATION, {
                                            title: "Submit Scores",
                                            message: "Are you sure you want to submit these scores?",
                                            confirmText: "Submit Scores",
                                            onConfirm: () => onEndSession(group.id),
                                            matches: group.matches
                                        });
                                    }}
                                >
                                    Submit
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="clipboard-table-wrapper">
                    <table className="clipboard-table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>#</th>
                                <th style={{ width: '25%' }}>Team 1</th>
                                <th style={{ width: '10%', textAlign: 'center' }}>Score</th>
                                <th style={{ width: '10%', textAlign: 'center' }}>Score</th>
                                <th style={{ width: '25%' }}>Team 2</th>
                                <th style={{ width: '15%' }}>Winner</th>
                                {(isActive || isEditing) && <th style={{ width: '10%' }}>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {group.matches.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="empty-table-cell">
                                        No matches recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                group.matches.map((match, idx) => {
                                    const t1p1 = match['Team 1 Player 1'];
                                    const t1p2 = match['Team 1 Player 2'];
                                    const t2p1 = match['Team 2 Player 1'];
                                    const t2p2 = match['Team 2 Player 2'];
                                    const t1Score = match['Team 1 Score'];
                                    const t2Score = match['Team 2 Score'];
                                    
                                    return (
                                        <tr key={match.id || idx}>
                                            <td>{idx + 1}</td>
                                            <td>
                                                <div className="player-cell">
                                                    <span className="player-name clickable" onClick={() => t1p1 && onPlayerClick(t1p1)}>{t1p1}</span>
                                                    {t1p2 && <span className="player-name clickable" onClick={() => onPlayerClick(t1p2)}>{t1p2}</span>}
                                                </div>
                                            </td>
                                            <td className="score-cell">{t1Score}</td>
                                            <td className="score-cell">{t2Score}</td>
                                            <td>
                                                <div className="player-cell">
                                                    <span className="player-name clickable" onClick={() => t2p1 && onPlayerClick(t2p1)}>{t2p1}</span>
                                                    {t2p2 && <span className="player-name clickable" onClick={() => onPlayerClick(t2p2)}>{t2p2}</span>}
                                                </div>
                                            </td>
                                            <td className={`winner-cell ${match.Winner === 'Team 1' ? 'team1-win' : match.Winner === 'Team 2' ? 'team2-win' : ''}`}>
                                                {match.Winner}
                                            </td>
                                            {(isActive || isEditing) && (
                                                <td className="actions-cell">
                                                    <button className="icon-button small" onClick={() => handleEditMatch(match)}>
                                                        <Edit2 size={14} />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {canAddMatches && (
                            <tfoot>
                                <tr>
                                    <td colSpan="7">
                                        <button 
                                            className="add-row-button"
                                            onClick={() => handleAddMatchToSession(group.id, seasonId)}
                                        >
                                            + Add Match
                                        </button>
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="clipboard-view-container">
            {activeSession && (
                renderSessionTable({
                    ...createSessionGroup(
                        activeSession.id,
                        activeSession.name,
                        'ACTIVE',
                        activeSession.created_at,
                        null, null, null
                    ),
                    matches: activeSessionMatches
                }, true)
            )}

            {sessionGroups.map(([key, group]) => {
                if (activeSession && group.id === activeSession.id && group.type === 'session') return null; // Update: Don't render active session twice
                const isEditing = group.type === 'session' && editingSessions.has(group.id);
                return renderSessionTable(group, false, isEditing);
            })}
            
            {sessionGroups.length === 0 && !activeSession && (
                <div className="empty-state">
                    <p>No sessions found. Start a new session or change filter.</p>
                </div>
            )}
        </div>
    );
}
