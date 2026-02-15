'use client';

import { useEffect, useRef } from 'react';
import { X, Users, UserPlus } from 'lucide-react';
import { useSessionPlayersModal } from './hooks/useSessionPlayersModal';
import SessionPlayersInSessionPanel from './SessionPlayersInSessionPanel';
import SessionPlayersAddPanel from './SessionPlayersAddPanel';

/**
 * Session Players modal (drawer): manages participants optimistically; add/remove
 * updates local state without parent refetch. Parent is notified only on close
 * (if mutations occurred). Uses batch invite on Done for pending adds.
 */
export default function SessionPlayersModal({
  isOpen,
  sessionId,
  participants = [],
  sessionCreatedByPlayerId = null,
  currentUserPlayerId = null,
  onClose,
  onSuccess,
  showMessage,
  message,
}) {
  const drawerRef = useRef(null);

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
    userLocationId,
  } = useSessionPlayersModal({
    isOpen,
    sessionId,
    participants,
    showMessage,
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
    el?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
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
          <h2 id="session-players-drawer-title">Manage players</h2>
          <button
            type="button"
            className="modal-close-button"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

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
