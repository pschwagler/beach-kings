'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, Calendar, LayoutList, ClipboardList, Plus, Share2, ChevronDown, Pencil } from 'lucide-react';
import {
  getSessionByCode,
  getSessionMatches,
  getSessionParticipants,
  joinSessionByCode,
  createMatch,
  updateMatch,
  deleteMatch,
  lockInSession,
  deleteSession,
  updateSession,
  removeSessionParticipant,
  getUserLeagues,
  createSession,
  inviteToSession,
} from '../../../src/services/api';
import { formatDate, formatRelativeTime } from '../../../src/utils/dateUtils';
import { useModal, MODAL_TYPES } from '../../../src/contexts/ModalContext';
import { useAuth } from '../../../src/contexts/AuthContext';
import NavBar from '../../../src/components/layout/NavBar';
import HomeMenuBar from '../../../src/components/home/HomeMenuBar';
import ActiveSessionPanel from '../../../src/components/session/ActiveSessionPanel';
import SessionPlayersModal from '../../../src/components/session/SessionPlayersModal';
import { sessionMatchToDisplayFormat, getUniquePlayersCount } from '../../../src/components/league/utils/matchUtils';
import { usePersistedViewMode } from '../../../src/hooks/usePersistedViewMode';
import { useClickOutside } from '../../../src/hooks/useClickOutside';

const SESSION_VIEW_STORAGE_KEY = 'beach-kings:session-matches-view';

/**
 * Session page by shareable code.
 * Shows session info and matches; league sessions redirect to league page.
 * Uses NavBar + full sidebar (no tab active). Reuses ActiveSessionPanel with Cards/Table toggle.
 */
export default function SessionByCodePage() {
  const router = useRouter();
  const params = useParams();
  const { openModal, closeModal } = useModal();
  const { isAuthenticated, isInitializing, user, currentUserPlayer, logout } = useAuth();
  const code = params?.code;
  const [session, setSession] = useState(null);
  const [matches, setMatches] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userLeagues, setUserLeagues] = useState([]);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [editingSessionName, setEditingSessionName] = useState(false);
  const [draftSessionName, setDraftSessionName] = useState('');
  const [message, setMessage] = useState(null);
  const shareMenuRef = useRef(null);
  const [viewMode, setViewMode] = usePersistedViewMode(SESSION_VIEW_STORAGE_KEY, 'cards');
  const [isEditingCompleted, setIsEditingCompleted] = useState(false);
  const [creatingFromPlayers, setCreatingFromPlayers] = useState(false);

  // Track one-time actions per session visit to prevent duplicates from React effects
  const visitActionsRef = useRef({
    sessionCode: null,
    autoJoinDone: false,
    managePlayersAutoOpened: false,
  });

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

  useEffect(() => {
    if (isAuthenticated) {
      getUserLeagues().then(setUserLeagues).catch(() => setUserLeagues([]));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isInitializing, router]);

  // Reset visit actions when navigating to a different session
  useEffect(() => {
    if (code !== visitActionsRef.current.sessionCode) {
      visitActionsRef.current = {
        sessionCode: code,
        autoJoinDone: false,
        managePlayersAutoOpened: false,
      };
    }
  }, [code]);

  // Auto-join: when logged-in user opens session page and is not in participants, add them
  useEffect(() => {
    if (!session || !code || !isAuthenticated || !currentUserPlayer || session.status !== 'ACTIVE') return;
    if (visitActionsRef.current.autoJoinDone) return;
    const participantIds = new Set((participants || []).map((p) => p.player_id));
    if (participantIds.has(currentUserPlayer.id)) return;
    visitActionsRef.current.autoJoinDone = true;
    joinSessionByCode(code)
      .then(() => setRefreshTrigger((t) => t + 1))
      .catch(() => { visitActionsRef.current.autoJoinDone = false; });
  }, [session, code, isAuthenticated, currentUserPlayer, participants]);

  useClickOutside(shareMenuRef, shareMenuOpen, () => setShareMenuOpen(false));

  const transformedMatches = useMemo(
    () => (matches || []).map(sessionMatchToDisplayFormat),
    [matches]
  );

  const membersForModal = useMemo(
    () =>
      (participants || []).map((p) => ({
        player_id: p.player_id,
        player_name: p.full_name || `Player ${p.player_id}`,
      })),
    [participants]
  );

  const isCreator = session?.created_by != null && currentUserPlayer?.id === session.created_by;
  const hasLessThanFourPlayers = !participants || participants.length < 4;
  const isActive = session?.status === 'ACTIVE';

  const submittedTimestampText = useMemo(() => {
    if (isActive || !session?.updated_at) return null;
    const ts = formatRelativeTime(session.updated_at);
    const by = session.updated_by_name || session.created_by_name || 'Unknown';
    return `Submitted ${ts} by ${by}`;
  }, [isActive, session?.updated_at, session?.updated_by_name, session?.created_by_name]);

  // Auto-open Manage Players when fewer than 4 players (once per visit, only after load completes)
  useEffect(() => {
    if (!loading && session && isActive && hasLessThanFourPlayers && !visitActionsRef.current.managePlayersAutoOpened) {
      visitActionsRef.current.managePlayersAutoOpened = true;
      setShowPlayersModal(true);
    }
  }, [loading, session, isActive, hasLessThanFourPlayers]);

  const handleCopyLink = () => {
    if (typeof window === 'undefined' || !code) return;
    const url = `${window.location.origin}/session/${code}`;
    window.navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    setShareMenuOpen(false);
  };

  const handleShareVia = async () => {
    if (typeof window === 'undefined' || !navigator.share || !code) {
      handleCopyLink();
      return;
    }
    const url = `${window.location.origin}/session/${code}`;
    try {
      await navigator.share({
        title: session?.name || 'Session',
        url,
        text: 'Join this session',
      });
      setShareMenuOpen(false);
    } catch (err) {
      if (err.name !== 'AbortError') handleCopyLink();
    }
  };

  const handleAddMatch = async (matchPayload) => {
    if (!session?.id) return;
    if (matchPayload.match_id != null) {
      await updateMatch(matchPayload.match_id, matchPayload);
    } else {
      await createMatch({ ...matchPayload, session_id: session.id });
    }
    setRefreshTrigger((t) => t + 1);
    closeModal();
  };

  const handleEditMatch = (match) => {
    openModal(MODAL_TYPES.ADD_MATCH, {
      editMatch: match,
      sessionId: session.id,
      sessionOnly: true,
      members: membersForModal,
      allPlayerNames: [],
      onSubmit: handleAddMatch,
      onDelete: async (matchId) => {
        await deleteMatch(matchId);
        setRefreshTrigger((t) => t + 1);
        closeModal();
      },
    });
  };

  const handleDeleteMatch = async (matchId) => {
    await deleteMatch(matchId);
    setRefreshTrigger((t) => t + 1);
  };

  const handleAddMatchClick = () => {
    if (hasLessThanFourPlayers) return;
    openModal(MODAL_TYPES.ADD_MATCH, {
      sessionId: session.id,
      sessionOnly: true,
      members: membersForModal,
      allPlayerNames: [],
      onSubmit: handleAddMatch,
    });
  };

  const handleRequestDeleteSession = () => {
    openModal(MODAL_TYPES.CONFIRMATION, {
      title: 'Delete Session',
      message: `This will delete the session and all ${transformedMatches.length} game${transformedMatches.length === 1 ? '' : 's'} forever. This cannot be undone.`,
      confirmText: 'Delete Session',
      confirmButtonClass: 'danger',
      sessionName: session?.name,
      onConfirm: async () => {
        await deleteSession(session.id);
        router.push('/home?tab=my-games');
      },
    });
  };

  const handleLeaveSession = async () => {
    if (!session?.id || !currentUserPlayer?.id) return;
    await removeSessionParticipant(session.id, currentUserPlayer.id);
    router.push('/home?tab=my-games');
  };

  const handleSubmitClick = () => {
    openModal(MODAL_TYPES.CONFIRMATION, {
      title: 'Submit Scores',
      message: 'Are you sure you want to submit these scores? Once submitted, games will be locked in.',
      confirmText: 'Submit Scores',
      cancelText: 'Cancel',
      onConfirm: async () => {
        await lockInSession(session.id);
        setRefreshTrigger((t) => t + 1);
      },
    });
  };

  const handleSaveEditedSession = async () => {
    await lockInSession(session.id);
    setRefreshTrigger((t) => t + 1);
    setIsEditingCompleted(false);
  };

  const handleCreateNewWithSamePlayers = async () => {
    if (creatingFromPlayers || !session?.id || !participants?.length) return;
    setCreatingFromPlayers(true);
    setMessage(null);
    try {
      const res = await createSession({});
      const newSess = res?.session ?? res;
      if (!newSess?.code) {
        setMessage('Could not create session. Please try again.');
        return;
      }
      for (const p of participants) {
        if (p.player_id === currentUserPlayer?.id) continue;
        try {
          await inviteToSession(newSess.id, p.player_id);
        } catch (err) {
          console.warn('Could not invite player to new session:', err);
        }
      }
      router.push(`/session/${newSess.code}`);
    } catch (err) {
      console.error('Error creating session from players:', err);
      setMessage(err.response?.data?.detail || err.message || 'Failed to create session');
    } finally {
      setCreatingFromPlayers(false);
    }
  };

  const handleLeaguesMenuClick = (action, leagueId) => {
    if (action === 'create-league') {
      router.push('/home');
      return;
    }
    if (action === 'view-league' && leagueId) {
      router.push(`/league/${leagueId}`);
    } else if (action === 'find-leagues') {
      router.push('/find-leagues');
    }
  };

  if (isInitializing || !isAuthenticated) return null;

  if (loading) {
    return (
      <>
        <NavBar
          isLoggedIn={isAuthenticated}
          user={user}
          currentUserPlayer={currentUserPlayer}
          userLeagues={userLeagues}
          onLeaguesMenuClick={handleLeaguesMenuClick}
          onSignOut={logout}
          onSignIn={() => {}}
          onSignUp={() => {}}
        />
        <div className="league-dashboard-container">
          <div className="league-dashboard">
            <HomeMenuBar />
            <main className="home-content">
              <div className="session-page session-page-loading">
                <p>Loading session…</p>
              </div>
            </main>
          </div>
        </div>
      </>
    );
  }

  if (error || !session) {
    return (
      <>
        <NavBar
          isLoggedIn={isAuthenticated}
          user={user}
          currentUserPlayer={currentUserPlayer}
          userLeagues={userLeagues}
          onLeaguesMenuClick={handleLeaguesMenuClick}
          onSignOut={logout}
          onSignIn={() => {}}
          onSignUp={() => {}}
        />
        <div className="league-dashboard-container">
          <div className="league-dashboard">
            <HomeMenuBar />
            <main className="home-content">
              <div className="session-page session-page-error">
                <Link href="/home?tab=my-games" className="session-page-back">
                  <ArrowLeft size={18} /> My Games
                </Link>
                <p>{error || 'Session not found'}</p>
              </div>
            </main>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
        onSignOut={logout}
        onSignIn={() => {}}
        onSignUp={() => {}}
      />
      <div className="league-dashboard-container">
        <div className="league-dashboard">
          <HomeMenuBar />
          <main className="home-content">
            <div className="session-page">
              <Link href="/home?tab=my-games" className="session-page-back">
                <ArrowLeft size={18} /> My Games
              </Link>

              <header className="session-page-header">
                {isActive ? (
                  <>
                    <div className="session-page-title-row">
                      {editingSessionName ? (
                        <>
                          <input
                            type="text"
                            className="session-page-title-input"
                            value={draftSessionName}
                            onChange={(e) => setDraftSessionName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const name = draftSessionName.trim() || session.name || 'Session';
                                updateSession(session.id, { name })
                                  .then(() => setSession((prev) => ({ ...prev, name })))
                                  .catch((err) => console.error('Failed to rename session:', err))
                                  .finally(() => {
                                    setEditingSessionName(false);
                                    setDraftSessionName('');
                                  });
                              } else if (e.key === 'Escape') {
                                setEditingSessionName(false);
                                setDraftSessionName('');
                              }
                            }}
                            autoFocus
                            aria-label="Session name"
                          />
                          <button
                            type="button"
                            className="session-page-title-save"
                            onClick={() => {
                              const name = draftSessionName.trim() || session.name || 'Session';
                              updateSession(session.id, { name })
                                .then(() => setSession((prev) => ({ ...prev, name })))
                                .catch((err) => console.error('Failed to rename session:', err))
                                .finally(() => {
                                  setEditingSessionName(false);
                                  setDraftSessionName('');
                                });
                            }}
                          >
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <h1 className="session-page-title">{session.name || 'Session'}</h1>
                          {isCreator && (
                            <button
                              type="button"
                              className="session-page-title-edit"
                              onClick={() => {
                                setDraftSessionName(session.name || '');
                                setEditingSessionName(true);
                              }}
                              title="Rename session"
                              aria-label="Rename session"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                        </>
                      )}
                      {!editingSessionName && (
                        isCreator ? (
                          <button
                            type="button"
                            className="session-page-delete-link"
                            onClick={handleRequestDeleteSession}
                            title="Delete session"
                          >
                            Delete Session
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="session-page-delete-link"
                            onClick={handleLeaveSession}
                            title="Leave this session"
                          >
                            Leave Session
                          </button>
                        )
                      )}
                    </div>
                    <div className="session-page-meta">
                      {session.league_id != null ? (
                        <span className="open-sessions-list-badge league">League</span>
                      ) : (
                        <span className="open-sessions-list-badge pickup">Pickup</span>
                      )}
                      {session.created_at && (
                        <span className="session-page-created-by">
                          Created by {session.created_by_name || 'Unknown'} {formatRelativeTime(session.created_at)}
                        </span>
                      )}
                      {session.date && (
                        <span className="session-page-date">
                          <Calendar size={16} /> {formatDate(session.date)}
                        </span>
                      )}
                      {session.code && (
                        <span className="session-page-share" ref={shareMenuRef}>
                          <div className="session-share-dropdown">
                            <button
                              type="button"
                              className="league-text-button session-share-trigger"
                              onClick={() => setShareMenuOpen((o) => !o)}
                              title="Invite"
                            >
                              <Share2 size={14} /> Invite <ChevronDown size={14} className={shareMenuOpen ? 'rotate-180' : ''} />
                            </button>
                            {shareMenuOpen && (
                              <div className="session-share-dropdown-menu">
                                <button type="button" className="session-share-dropdown-item" onClick={handleCopyLink}>
                                  <Copy size={16} /> {copied ? 'Copied!' : 'Copy link'}
                                </button>
                                <button type="button" className="session-share-dropdown-item" onClick={handleShareVia}>
                                  <Share2 size={16} /> Share via…
                                </button>
                              </div>
                            )}
                          </div>
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="session-page-meta">
                      {session.league_id != null ? (
                        <span className="open-sessions-list-badge league">League</span>
                      ) : (
                        <span className="open-sessions-list-badge pickup">Pickup</span>
                      )}
                      {session.created_at && (
                        <span className="session-page-created-by">
                          Created by {session.created_by_name || 'Unknown'} {formatRelativeTime(session.created_at)}
                        </span>
                      )}
                      {session.date && (
                        <span className="session-page-date">
                          <Calendar size={16} /> {formatDate(session.date)}
                        </span>
                      )}
                      {isCreator ? (
                        <button
                          type="button"
                          className="session-page-delete-link"
                          onClick={handleRequestDeleteSession}
                          title="Delete session"
                        >
                          Delete Session
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="session-page-delete-link"
                          onClick={handleLeaveSession}
                          title="Leave this session"
                        >
                          Leave Session
                        </button>
                      )}
                    </div>
                    <div className="session-ended-block">
                      <span className="session-ended-label">Session has ended.</span>
                      {isCreator && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="session-ended-link"
                            onClick={handleCreateNewWithSamePlayers}
                            disabled={creatingFromPlayers || !participants?.length}
                            data-testid="create-new-session-with-players-button"
                          >
                            {creatingFromPlayers ? 'Creating…' : 'Create new session with same players'}
                          </button>
                          {message && (
                            <span className="secondary-text" style={{ marginLeft: 8 }} role="alert">
                              {message}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </header>

              {hasLessThanFourPlayers && isActive ? (
                <div className="session-page-add-players-block">
                  <p>Add at least 4 players to this session to log games.</p>
                  <button
                    type="button"
                    className="league-text-button primary"
                    onClick={() => setShowPlayersModal(true)}
                  >
                    <Plus size={18} /> Manage players
                  </button>
                </div>
              ) : (
                <>
                  <div className="rankings-filters-row" style={{ justifyContent: 'flex-start', marginBottom: '16px' }}>
                    <div className="view-toggle">
                      <button
                        className={`view-toggle-button ${viewMode === 'cards' ? 'active' : ''}`}
                        onClick={() => setViewMode('cards')}
                        title="Card View"
                      >
                        <LayoutList size={18} />
                        Cards
                      </button>
                      <button
                        className={`view-toggle-button ${viewMode === 'clipboard' ? 'active' : ''}`}
                        onClick={() => setViewMode('clipboard')}
                        title="Table View"
                      >
                        <ClipboardList size={18} />
                        Table
                      </button>
                    </div>
                    {isActive && (
                      <button
                        type="button"
                        className="league-text-button"
                        onClick={() => setShowPlayersModal(true)}
                        style={{ marginLeft: '16px' }}
                      >
                        Manage players
                      </button>
                    )}
                    {!isActive && isCreator && isEditingCompleted && (
                      <button
                        type="button"
                        className="league-text-button"
                        onClick={() => setIsEditingCompleted(false)}
                        style={{ marginLeft: '16px' }}
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>

                  <ActiveSessionPanel
                    activeSession={{
                      id: session.id,
                      name: session.name,
                      status: session.status,
                      season_id: null,
                    }}
                    activeSessionMatches={transformedMatches}
                    onPlayerClick={() => {}}
                    contentVariant={viewMode === 'clipboard' ? 'clipboard' : 'cards'}
                    variant="non-league"
                    isAdmin={isCreator}
                    isSubmitted={!isActive}
                    submittedTimestampText={submittedTimestampText ?? undefined}
                    onEditSessionClick={isCreator && !isEditingCompleted ? () => setIsEditingCompleted(true) : null}
                    onAddMatchClick={isActive || isEditingCompleted ? handleAddMatchClick : undefined}
                    onEditMatch={isActive || (isCreator && isEditingCompleted) ? handleEditMatch : undefined}
                    onSubmitClick={isActive ? handleSubmitClick : undefined}
                    onSaveClick={!isActive && isEditingCompleted ? handleSaveEditedSession : null}
                    onCancelClick={!isActive && isEditingCompleted ? () => setIsEditingCompleted(false) : null}
                    isEditing={isEditingCompleted}
                    onDeleteSession={async () => {
                      await deleteSession(session.id);
                      router.push('/home?tab=my-games');
                    }}
                    onRequestDeleteSession={handleRequestDeleteSession}
                    onRequestLeaveSession={handleLeaveSession}
                    onUpdateSessionSeason={null}
                    onStatsClick={() => {
                      openModal(MODAL_TYPES.SESSION_SUMMARY, {
                        title: session.name || 'Session Summary',
                        gameCount: transformedMatches.length,
                        playerCount: getUniquePlayersCount(transformedMatches),
                        matches: transformedMatches,
                        season: null,
                      });
                    }}
                    seasons={[]}
                    selectedSeasonId={null}
                  />
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      <SessionPlayersModal
        isOpen={showPlayersModal}
        sessionId={session?.id}
        participants={participants}
        sessionCreatedByPlayerId={session?.created_by ?? null}
        currentUserPlayerId={currentUserPlayer?.id ?? null}
        onClose={() => { setShowPlayersModal(false); setMessage(null); }}
        onSuccess={() => {
          setRefreshTrigger((t) => t + 1);
        }}
        showMessage={(_, msg) => setMessage(msg)}
        message={message}
      />
    </>
  );
}
