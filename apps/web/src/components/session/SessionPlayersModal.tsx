'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Users, UserPlus } from 'lucide-react';
import { useSessionPlayersModal } from './hooks/useSessionPlayersModal';
import SessionPlayersInSessionPanel from './SessionPlayersInSessionPanel';
import SessionPlayersAddPanel from './SessionPlayersAddPanel';
import CourtSelector from '../court/CourtSelector';
import { getPlayerHomeCourts, getNearbyCourts } from '../../services/api';
import { useUserPosition } from '../../hooks/useUserPosition';
import type { Player } from '../../types';

interface Participant {
  player_id: number;
  full_name?: string | null;
  player_name?: string | null;
  gender?: string | null;
  level?: string | null;
  location_name?: string | null;
}

interface HomeCourt {
  id: number;
  name: string;
}

interface SessionPlayersModalProps {
  isOpen: boolean;
  sessionId: number | null;
  participants?: Participant[];
  sessionCreatedByPlayerId?: number | null;
  currentUserPlayerId?: number | null;
  currentUserPlayer?: Player | null;
  onClose: () => void;
  onSuccess?: (() => void) | null;
  message?: string | null;
  sessionName?: string;
  sessionCourtId?: number | null;
  sessionCourtName?: string | null;
  sessionCourtSlug?: string | null;
  onUpdateSession?: ((update: Record<string, unknown>) => void) | null;
}

/**
 * Manage Session modal (drawer): session name, court selection, and participant management.
 * Session name and court are editable by anyone with access (not just creator).
 * Uses batch invite on Done for pending adds.
 */
export default function SessionPlayersModal({
  isOpen,
  sessionId,
  participants = [],
  sessionCreatedByPlayerId = null,
  currentUserPlayerId = null,
  currentUserPlayer = null,
  onClose,
  onSuccess,
  message,
  sessionName = '',
  sessionCourtId = null,
  sessionCourtName = null,
  sessionCourtSlug = null,
  onUpdateSession,
}: SessionPlayersModalProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [draftName, setDraftName] = useState(sessionName);
  const [courtId, setCourtId] = useState(sessionCourtId);
  const [courtName, setCourtName] = useState(sessionCourtName);
  const [playerHomeCourts, setPlayerHomeCourts] = useState<HomeCourt[]>([]);
  const defaultAppliedRef = useRef(false);

  // Geo position for nearest-court fallback
  const profileCoords = currentUserPlayer?.city_latitude && currentUserPlayer?.city_longitude
    ? { latitude: currentUserPlayer.city_latitude, longitude: currentUserPlayer.city_longitude }
    : null;
  const { position } = useUserPosition(profileCoords);

  // Sync props → local state when modal opens or props change
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync props to local form state
      setDraftName(sessionName);
      setCourtId(sessionCourtId);
      setCourtName(sessionCourtName);
      // Reset default tracking when session court changes externally
      if (sessionCourtId != null) {
        defaultAppliedRef.current = true;
      } else {
        defaultAppliedRef.current = false;
      }
    }
  }, [isOpen, sessionName, sessionCourtId, sessionCourtName]);

  // Load player home courts for CourtSelector quick picks
  useEffect(() => {
    if (!isOpen || !currentUserPlayerId) return;
    getPlayerHomeCourts(currentUserPlayerId)
      .then((courts) => setPlayerHomeCourts(courts || []))
      .catch(() => {});
  }, [isOpen, currentUserPlayerId]);

  // Auto-default court when session has none:
  // 1. Player's primary home court (position=0)
  // 2. Nearest court to player's geo position
  // 3. Leave as null (user can pick manually)
  useEffect(() => {
    if (!isOpen || !onUpdateSession || defaultAppliedRef.current || sessionCourtId != null) return;

    const applyDefault = async () => {
      // Priority 1: player's primary home court
      if (playerHomeCourts.length > 0) {
        const primary = playerHomeCourts[0];
        defaultAppliedRef.current = true;
        setCourtId(primary.id);
        setCourtName(primary.name);
        onUpdateSession({ court_id: primary.id });
        return;
      }

      // Priority 2: nearest court to geo position
      if (position?.latitude && position?.longitude) {
        try {
          const nearby = await getNearbyCourts(position.latitude, position.longitude, 25);
          if (nearby?.length > 0) {
            defaultAppliedRef.current = true;
            setCourtId(nearby[0].id);
            setCourtName(nearby[0].name);
            onUpdateSession({ court_id: nearby[0].id });
            return;
          }
        } catch {
          // Ignore — fall through to no default
        }
      }

      // No default found — leave as null
      defaultAppliedRef.current = true;
    };

    applyDefault();
  }, [isOpen, onUpdateSession, sessionCourtId, playerHomeCourts, position]);

  const handleNameBlur = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== sessionName && onUpdateSession) {
      onUpdateSession({ name: trimmed });
    }
  }, [draftName, sessionName, onUpdateSession]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }, []);

  const handleCourtChange = useCallback((newCourtId: number | null) => {
    setCourtId(newCourtId);
    setCourtName(null); // CourtSelector manages display name internally after user interaction
    if (onUpdateSession) {
      onUpdateSession({ court_id: newCourtId });
    }
  }, [onUpdateSession]);

  const {
    localParticipants,
    setDrawerView,
    drawerView,
    items,
    loading,
    loadingMore,
    hasMore,
    searchTerm,
    setSearchTerm,
    locationIds,
    leagueIds,
    genderFilters,
    levelFilters,
    locations,
    leagues,
    removingId,
    pendingAddIds,
    filtersOpen,
    setFiltersOpen,
    participantIds,
    activeFilterCount,
    filterButtonRef,
    filterPopoverRef,
    handleClose,
    handleLoadMore,
    handleRemove,
    handleAdd,
    handleRemoveFilter,
    handleToggleFilter,
    handleCreatePlaceholder,
    isCreatingPlaceholder,
    handleSearchPlayers,
    userLocationId,
  } = useSessionPlayersModal({
    isOpen,
    sessionId,
    participants,
    onSuccess,
    onClose,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (isOpen) document.body.classList.add('drawer-open');
    else document.body.classList.remove('drawer-open');
    return () => document.body.classList.remove('drawer-open');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const el = drawerRef.current?.querySelector('button[aria-label="Close"], .modal-close-button');
    (el as HTMLElement | null)?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="session-players-drawer-backdrop"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className="session-players-drawer session-players-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-players-drawer-title"
        data-testid="session-players-drawer"
      >
        <div className="session-players-drawer-header">
          <h2 id="session-players-drawer-title">Manage session</h2>
          <button
            type="button"
            className="modal-close-button"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {onUpdateSession && (
          <div className="session-manage-details">
            <div className="session-manage-field">
              <label className="session-manage-label" htmlFor="session-manage-name">Session Name</label>
              <input
                id="session-manage-name"
                type="text"
                className="session-manage-input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={handleNameKeyDown}
                placeholder="Session name"
              />
            </div>
            <div className="session-manage-field">
              <CourtSelector
                value={courtId}
                valueName={courtName}
                onChange={handleCourtChange}
                homeCourts={playerHomeCourts}
                preFilterLocationId={currentUserPlayer?.location_id}
                label="Court"
              />
            </div>
          </div>
        )}

        {localParticipants.length < 4 && (
          <p className="session-players-modal-intro">
            Add players below to include them in games. They can view and log games once added.
          </p>
        )}

        <div className="session-players-drawer-body">
          <div className="session-players-view-tabs" role="tablist" aria-label="Manage players view">
            <button
              type="button"
              role="tab"
              aria-selected={drawerView === 'in-session'}
              aria-controls="session-players-in-session-panel"
              id="session-players-tab-in-session"
              className={`session-players-view-tab ${drawerView === 'in-session' ? 'active' : ''}`}
              onClick={() => setDrawerView('in-session')}
            >
              <Users size={18} aria-hidden />
              In this session ({localParticipants.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={drawerView === 'add-player'}
              aria-controls="session-players-add-panel"
              id="session-players-tab-add"
              className={`session-players-view-tab ${drawerView === 'add-player' ? 'active' : ''}`}
              onClick={() => setDrawerView('add-player')}
            >
              <UserPlus size={18} aria-hidden />
              Add players
            </button>
          </div>

          {drawerView === 'in-session' && (
            <SessionPlayersInSessionPanel
              participants={localParticipants}
              sessionCreatedByPlayerId={sessionCreatedByPlayerId}
              currentUserPlayerId={currentUserPlayerId}
              onRemove={handleRemove}
              removingId={removingId}
            />
          )}

          {drawerView === 'add-player' && (
            <SessionPlayersAddPanel
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              locationIds={locationIds}
              leagueIds={leagueIds}
              genderFilters={genderFilters}
              levelFilters={levelFilters}
              locations={locations}
              leagues={leagues}
              onToggleFilter={handleToggleFilter}
              onRemoveFilter={handleRemoveFilter}
              items={items}
              participantIds={participantIds}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onAdd={handleAdd}
              pendingAddIds={pendingAddIds}
              onLoadMore={handleLoadMore}
              filtersOpen={filtersOpen}
              onFiltersOpenChange={setFiltersOpen}
              filterButtonRef={filterButtonRef}
              filterPopoverRef={filterPopoverRef}
              activeFilterCount={activeFilterCount}
              userLocationId={userLocationId}
              onCreatePlaceholder={handleCreatePlaceholder}
              isCreatingPlaceholder={isCreatingPlaceholder}
              onSearchPlayers={handleSearchPlayers}
            />
          )}
        </div>

        <div className="session-players-drawer-actions">
          {message && (
            <div className="session-players-message" role="alert">
              {message}
            </div>
          )}
          <button type="button" className="league-text-button primary" onClick={handleClose}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
