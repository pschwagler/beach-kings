'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Filter, MapPin, X, UserPlus } from 'lucide-react';
import { GENDER_FILTER_OPTIONS, LEVEL_FILTER_OPTIONS } from '../../utils/playerFilterOptions';
import { formatDivisionLabel } from '../../utils/divisionUtils';
import PlayerFilterPopover from './PlayerFilterPopover';
import PlaceholderCreateModal from '../player/PlaceholderCreateModal';

/**
 * Add-players panel: search, filters (Location/League/Gender/Level), filter pills,
 * and scrollable list of players with Add button and Load more.
 */
export default function SessionPlayersAddPanel({
  searchTerm,
  onSearchChange,
  locationIds,
  leagueIds,
  genderFilters,
  levelFilters,
  locations,
  leagues,
  onToggleFilter,
  onRemoveFilter,
  items,
  participantIds,
  loading,
  loadingMore,
  hasMore,
  onAdd,
  pendingAddIds,
  onLoadMore,
  filtersOpen,
  onFiltersOpenChange,
  filterButtonRef,
  filterPopoverRef,
  activeFilterCount,
  userLocationId,
  onCreatePlaceholder,
  isCreatingPlaceholder,
  onSearchPlayers = null,
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [createModalState, setCreateModalState] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const createInputRef = useRef(null);
  const searchDebounceRef = useRef(null);

  useEffect(() => {
    if (showCreateForm) {
      setTimeout(() => createInputRef.current?.focus(), 50);
    }
  }, [showCreateForm]);

  // Debounced search when newPlayerName changes in create form
  useEffect(() => {
    if (!showCreateForm || !onSearchPlayers) {
      setSearchResults([]);
      return;
    }
    const trimmed = newPlayerName.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const result = await onSearchPlayers(trimmed);
        setSearchResults(result?.items || []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [newPlayerName, showCreateForm, onSearchPlayers]);

  /**
   * Open the create modal instead of creating directly.
   */
  const handleCreateSubmit = () => {
    if (!newPlayerName.trim() || !onCreatePlaceholder) return;
    setCreateModalState({ name: newPlayerName.trim() });
  };

  /**
   * Handle modal close — reset create form on success.
   * @param {Object|null} result - Created player data or null if cancelled
   */
  const handleModalClose = (result) => {
    setCreateModalState(null);
    if (result) {
      setNewPlayerName('');
      setShowCreateForm(false);
    }
  };

  const availableToAdd = items.filter((p) => !participantIds.has(p.id));
  const hasActiveFilters =
    locationIds.length > 0 ||
    leagueIds.length > 0 ||
    genderFilters.length > 0 ||
    levelFilters.length > 0;

  return (
    <section
      id="session-players-add-panel"
      role="tabpanel"
      aria-labelledby="session-players-tab-add"
      className="session-players-column session-players-add"
    >
      <div className="session-players-filters-row">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name..."
          className="form-input session-players-search"
          aria-label="Search players by name"
        />
        <div className="session-players-filters-trigger-wrap" ref={filterButtonRef}>
          <button
            type="button"
            className="session-players-filters-toggle"
            onClick={() => onFiltersOpenChange((prev) => !prev)}
            aria-expanded={filtersOpen}
            aria-label={
              filtersOpen
                ? 'Hide filters'
                : `Show filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`
            }
            aria-controls="session-players-filters-popover"
            aria-haspopup="true"
            title={activeFilterCount > 0 ? `${activeFilterCount} filter(s) active` : 'Filters'}
          >
            <Filter size={18} aria-hidden />
            {activeFilterCount > 0 && (
              <span className="session-players-filters-badge" aria-hidden="true">
                {activeFilterCount}
              </span>
            )}
          </button>
          {filtersOpen && (
            <PlayerFilterPopover
              ref={filterPopoverRef}
              locationIds={locationIds}
              leagueIds={leagueIds}
              genderFilters={genderFilters}
              levelFilters={levelFilters}
              locations={locations}
              leagues={leagues}
              onToggleFilter={onToggleFilter}
              userLocationId={userLocationId}
            />
          )}
        </div>
        {onCreatePlaceholder && (
          <button
            type="button"
            className="session-players-new-btn"
            onClick={() => setShowCreateForm((prev) => !prev)}
            aria-label="Add unregistered player"
            title="Add unregistered player"
          >
            <UserPlus size={16} aria-hidden />
            <span>+ Unregistered</span>
          </button>
        )}
      </div>

      {showCreateForm && onCreatePlaceholder && (
        <div className="session-players-create-form-wrap">
          <div className="session-players-create-form">
            <input
              ref={createInputRef}
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreateSubmit(); }
                if (e.key === 'Escape') { setShowCreateForm(false); setNewPlayerName(''); }
              }}
              placeholder="Player name"
              className="session-players-create-input"
              autoComplete="off"
            />
          </div>

          {isSearching && (
            <div className="session-players-create-search-results">
              <span className="session-players-create-search-label">Searching...</span>
            </div>
          )}

          {!isSearching && searchResults.length > 0 && (
            <div className="session-players-create-search-results">
              <span className="session-players-create-search-label">Did you mean one of these?</span>
              {searchResults.map((result) => (
                <div key={result.id} className="session-players-create-search-result">
                  <div className="session-players-create-search-result__info">
                    <span className="session-players-create-search-result__name">{result.full_name}</span>
                    <span className="session-players-create-search-result__meta">
                      {[result.location_name, result.gender, result.level].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="session-players-add-btn"
                    onClick={() => onAdd(result)}
                    aria-label={`Add ${result.full_name} to session`}
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="session-players-create-submit"
            onClick={handleCreateSubmit}
            disabled={isCreatingPlaceholder || newPlayerName.trim().length < 2}
          >
            {isCreatingPlaceholder
              ? 'Creating...'
              : searchResults.length > 0
                ? 'None of these — Create & Add'
                : 'Create & Add'
            }
          </button>
        </div>
      )}

      {hasActiveFilters && (
        <div className="session-players-filter-pills" role="group" aria-label="Active filters">
          {locationIds.map((id) => {
            const loc = locations.find((l) => l.id === id);
            return (
              <span key={`loc-${id}`} className="session-players-filter-pill">
                <span>{loc?.name || id}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFilter('location', id)}
                  aria-label={`Remove ${loc?.name || id} filter`}
                  className="session-players-filter-pill-remove"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          {leagueIds.map((id) => {
            const league = leagues.find((l) => l.id === id);
            return (
              <span key={`league-${id}`} className="session-players-filter-pill">
                <span>{league?.name || id}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFilter('league', id)}
                  aria-label={`Remove ${league?.name || id} filter`}
                  className="session-players-filter-pill-remove"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          {genderFilters.map((g) => {
            const label = GENDER_FILTER_OPTIONS.find((o) => o.value === g)?.label || g;
            return (
              <span key={`gender-${g}`} className="session-players-filter-pill">
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFilter('gender', g)}
                  aria-label={`Remove ${label} filter`}
                  className="session-players-filter-pill-remove"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          {levelFilters.map((l) => {
            const label = LEVEL_FILTER_OPTIONS.find((o) => o.value === l)?.label || l;
            return (
              <span key={`level-${l}`} className="session-players-filter-pill">
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFilter('level', l)}
                  aria-label={`Remove ${label} filter`}
                  className="session-players-filter-pill-remove"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className={`session-players-column-scroll session-players-add-list-wrapper${loading && items.length > 0 ? ' session-players-loading-fade' : ''}`}>
        {loading && items.length === 0 ? (
          <p className="session-players-empty">Loading players...</p>
        ) : (
          <>
            <ul className="session-players-add-list">
              {availableToAdd.length === 0 ? (
                <li className="session-players-empty">
                  {hasActiveFilters || searchTerm?.trim()
                    ? 'No players match. Try different filters.'
                    : 'No other players to add.'}
                </li>
              ) : (
                availableToAdd.map((player) => {
                  const name = player.name || player.full_name || `Player ${player.id}`;
                  const division = formatDivisionLabel(player.gender, player.level);
                  return (
                    <li key={player.id} className="session-players-add-item">
                      <div className="session-players-row-content">
                        <span className="session-players-row-name">{name}</span>
                        <span className="session-players-row-meta-wrap">
                          {division && (
                            <span className="session-players-row-meta" aria-hidden="true">
                              {division}
                            </span>
                          )}
                          {player.location_name && (
                            <span className="session-players-location-pill" aria-hidden="true">
                              <MapPin size={12} /> {player.location_name}
                            </span>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="session-players-add-btn"
                        onClick={() => onAdd(player)}
                        disabled={pendingAddIds.has(player.id)}
                        aria-label={`Add ${name} to session`}
                        title="Add to session"
                      >
                        <Plus size={16} /> Add
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            {hasMore && (
              <button
                type="button"
                className="session-players-load-more"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
      <PlaceholderCreateModal
        isOpen={!!createModalState}
        playerName={createModalState?.name || ''}
        onCreate={onCreatePlaceholder}
        onClose={handleModalClose}
      />
    </section>
  );
}
