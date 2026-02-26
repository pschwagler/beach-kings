'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Plus, Filter, UserPlus } from 'lucide-react';
import {
  getPlayers,
  addLeagueMembersBatch,
  getLocations,
  listLeagues,
  createPlaceholderPlayer,
} from '../../services/api';
import { getPlayerDisplayName, ROLE_OPTIONS } from './utils/leagueUtils';
import { useLeague } from '../../contexts/LeagueContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { GENDER_FILTER_OPTIONS, LEVEL_FILTER_OPTIONS } from '../../utils/playerFilterOptions';
import { formatDivisionLabel } from '../../utils/divisionUtils';
import PlayerFilterPopover from '../session/PlayerFilterPopover';
import PlaceholderCreateModal from '../player/PlaceholderCreateModal';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Drawer (sidebar) to add multiple players to a league. Supports search,
 * filters (Location, League, Gender, Level), and batch submit. Uses batch
 * API and shows added/failed counts on partial failure.
 */
export default function AddPlayersModal({ isOpen, members, onClose, onSuccess }) {
  const { leagueId } = useLeague();
  const { showToast } = useToast();
  const { currentUserPlayer } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [locationIds, setLocationIds] = useState([]);
  const [leagueIds, setLeagueIds] = useState([]);
  const [genderFilters, setGenderFilters] = useState([]);
  const [levelFilters, setLevelFilters] = useState([]);
  const [locations, setLocations] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]); // [{ player_id, role }]
  const [selectedPlayerDetails, setSelectedPlayerDetails] = useState({}); // { player_id: player }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [createModalState, setCreateModalState] = useState(null);
  const [isCreatingPlaceholder, setIsCreatingPlaceholder] = useState(false);
  const [createSearchResults, setCreateSearchResults] = useState([]);
  const [isCreateSearching, setIsCreateSearching] = useState(false);
  const debounceRef = useRef(null);
  const filterButtonRef = useRef(null);
  const filterPopoverRef = useRef(null);
  const createInputRef = useRef(null);
  const createSearchDebounceRef = useRef(null);

  const memberIds = useMemo(() => new Set((members || []).map((m) => m.player_id)), [members]);
  const selectedIds = useMemo(() => new Set(selectedPlayers.map((sp) => sp.player_id)), [selectedPlayers]);
  const isPlayerDisabled = useCallback(
    (playerId) => memberIds.has(playerId) || selectedIds.has(playerId),
    [memberIds, selectedIds]
  );

  const activeFilterCount = useMemo(
    () => locationIds.length + leagueIds.length + genderFilters.length + levelFilters.length,
    [locationIds, leagueIds, genderFilters, levelFilters]
  );

  // Debounce search
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(searchTerm.trim());
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, isOpen]);

  // Load locations and leagues when modal opens
  useEffect(() => {
    if (!isOpen) return;
    getLocations()
      .then((data) => setLocations(Array.isArray(data) ? data : []))
      .catch(() => setLocations([]));
    listLeagues()
      .then((data) => setLeagues(Array.isArray(data) ? data : []))
      .catch(() => setLeagues([]));
  }, [isOpen]);

  const fetchPage = useCallback(
    async (pageOffset, append = false) => {
      const params = {
        q: debouncedQ || undefined,
        location_id: locationIds.length ? locationIds : undefined,
        league_id: leagueIds.length ? leagueIds : undefined,
        gender: genderFilters.length ? genderFilters : undefined,
        level: levelFilters.length ? levelFilters : undefined,
        limit: PAGE_SIZE,
        offset: pageOffset,
      };
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await getPlayers(params);
        const list = Array.isArray(data?.items) ? data.items : [];
        const count = typeof data?.total === 'number' ? data.total : 0;
        if (append) setItems((prev) => [...prev, ...list]);
        else setItems(list);
        setTotal(count);
      } catch (err) {
        console.error('Error loading players:', err);
        showToast('Failed to load players', 'error');
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ, locationIds, leagueIds, genderFilters, levelFilters, showToast]
  );

  useEffect(() => {
    if (!isOpen) return;
    setOffset(0);
    fetchPage(0, false);
  }, [isOpen, debouncedQ, locationIds, leagueIds, genderFilters, levelFilters, fetchPage]);

  // Derive the default location filter from the current user's profile
  const defaultLocationIds = useMemo(
    () => (currentUserPlayer?.location_id ? [currentUserPlayer.location_id] : []),
    [currentUserPlayer]
  );

  // Reset state when drawer closes; default location filter to user's location
  useEffect(() => {
    if (!isOpen) {
      setSelectedPlayers([]);
      setSelectedPlayerDetails({});
      setSearchTerm('');
      setDebouncedQ('');
      setLocationIds(defaultLocationIds);
      setLeagueIds([]);
      setGenderFilters([]);
      setLevelFilters([]);
      setItems([]);
      setTotal(0);
      setOffset(0);
      setLoading(false);
      setLoadingMore(false);
      setShowCreateForm(false);
      setNewPlayerName('');
      setCreateModalState(null);
      setCreateSearchResults([]);
    }
  }, [isOpen, defaultLocationIds]);

  // Close filters on click outside
  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (e) => {
      if (
        filterPopoverRef.current?.contains(e.target) ||
        filterButtonRef.current?.contains(e.target)
      )
        return;
      setFiltersOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filtersOpen]);

  // Body class to prevent background scroll
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (isOpen) document.body.classList.add('drawer-open');
    else document.body.classList.remove('drawer-open');
    return () => {
      if (typeof document !== 'undefined') document.body.classList.remove('drawer-open');
    };
  }, [isOpen]);

  const hasMore = items.length < total;
  const hasActiveFilters =
    locationIds.length > 0 ||
    leagueIds.length > 0 ||
    genderFilters.length > 0 ||
    levelFilters.length > 0;

  const handleLoadMore = useCallback(() => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchPage(nextOffset, true);
  }, [offset, fetchPage]);

  const handleAddPlayer = useCallback((player) => {
    setSelectedPlayers((prev) => [...prev, { player_id: player.id, role: 'member' }]);
    setSelectedPlayerDetails((prev) => ({ ...prev, [player.id]: player }));
    setSearchTerm('');
  }, []);

  const handleRemovePlayer = useCallback((playerId) => {
    setSelectedPlayers((prev) => prev.filter((sp) => sp.player_id !== playerId));
    setSelectedPlayerDetails((prev) => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
  }, []);

  const handleChangeRole = useCallback((playerId, newRole) => {
    setSelectedPlayers((prev) =>
      prev.map((sp) => (sp.player_id === playerId ? { ...sp, role: newRole } : sp))
    );
  }, []);

  const handleRemoveFilter = useCallback((key, value) => {
    if (key === 'location') setLocationIds((prev) => prev.filter((id) => id !== value));
    if (key === 'league') setLeagueIds((prev) => prev.filter((id) => id !== value));
    if (key === 'gender') setGenderFilters((prev) => prev.filter((g) => g !== value));
    if (key === 'level') setLevelFilters((prev) => prev.filter((l) => l !== value));
    setOffset(0);
  }, []);

  const handleToggleFilter = useCallback((key, value) => {
    if (key === 'location') {
      setLocationIds((prev) =>
        prev.includes(value) ? prev.filter((id) => id !== value) : [...prev, value]
      );
    }
    if (key === 'league') {
      const id = Number(value);
      setLeagueIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    }
    if (key === 'gender') {
      setGenderFilters((prev) =>
        prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]
      );
    }
    if (key === 'level') {
      setLevelFilters((prev) =>
        prev.includes(value) ? prev.filter((l) => l !== value) : [...prev, value]
      );
    }
    setOffset(0);
  }, []);

  // Auto-focus create input when form opens
  useEffect(() => {
    if (showCreateForm) {
      setTimeout(() => createInputRef.current?.focus(), 50);
    }
  }, [showCreateForm]);

  // Debounced search for existing players when typing in the create form
  useEffect(() => {
    if (!showCreateForm) {
      setCreateSearchResults([]);
      return;
    }
    const trimmed = newPlayerName.trim();
    if (trimmed.length < 2) {
      setCreateSearchResults([]);
      return;
    }
    if (createSearchDebounceRef.current) clearTimeout(createSearchDebounceRef.current);
    setIsCreateSearching(true);
    createSearchDebounceRef.current = setTimeout(async () => {
      try {
        const data = await getPlayers({ q: trimmed, limit: 5, offset: 0 });
        setCreateSearchResults(data?.items || []);
      } catch {
        setCreateSearchResults([]);
      } finally {
        setIsCreateSearching(false);
      }
    }, 300);
    return () => {
      if (createSearchDebounceRef.current) clearTimeout(createSearchDebounceRef.current);
    };
  }, [newPlayerName, showCreateForm]);

  /**
   * Open the PlaceholderCreateModal with the entered name.
   */
  const handleCreateFormSubmit = useCallback(() => {
    if (!newPlayerName.trim()) return;
    setCreateModalState({ name: newPlayerName.trim() });
  }, [newPlayerName]);

  /**
   * Create placeholder player via API, add to selection list.
   * @param {string} name - Player name
   * @param {Object} extras - Optional gender/level
   * @returns {Promise<Object|null>} Created player data for the modal success state
   */
  const handleCreatePlaceholder = useCallback(async (name, extras = {}) => {
    if (!name?.trim() || isCreatingPlaceholder) return null;
    setIsCreatingPlaceholder(true);
    try {
      const response = await createPlaceholderPlayer({
        name: name.trim(),
        gender: extras.gender || undefined,
        level: extras.level || undefined,
      });
      const newPlayer = {
        id: response.player_id,
        full_name: response.name,
        is_placeholder: true,
      };
      // Add to selection so it's included in the batch submit
      setSelectedPlayers((prev) => [...prev, { player_id: response.player_id, role: 'member' }]);
      setSelectedPlayerDetails((prev) => ({ ...prev, [response.player_id]: newPlayer }));
      showToast(`${response.name} created and added`, 'success');
      return {
        value: response.player_id,
        label: response.name,
        name: response.name,
        inviteUrl: response.invite_url,
        inviteToken: response.invite_token,
        isPlaceholder: true,
      };
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to create player';
      showToast(detail, 'error');
      throw new Error(detail);
    } finally {
      setIsCreatingPlaceholder(false);
    }
  }, [isCreatingPlaceholder, showToast]);

  /**
   * Handle PlaceholderCreateModal close — reset create form on success.
   * @param {Object|null} result - Created player data or null if cancelled
   */
  const handleCreateModalClose = useCallback((result) => {
    setCreateModalState(null);
    if (result) {
      setNewPlayerName('');
      setShowCreateForm(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (selectedPlayers.length === 0) {
      showToast('Please select at least one player', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const result = await addLeagueMembersBatch(leagueId, selectedPlayers);
      const added = result?.added ?? [];
      const failed = result?.failed ?? [];
      if (failed.length > 0) {
        const msg =
          added.length > 0
            ? `${added.length} added; ${failed.length} failed (e.g. ${failed[0].error})`
            : failed.map((f) => f.error).join('; ');
        showToast(msg, 'error');
      }
      if (added.length > 0) {
        onSuccess?.();
        onClose?.();
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to add players', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [leagueId, selectedPlayers, showToast, onSuccess, onClose]);

  // Build list: selected at top (with role), then available from items. Use stored details so selected names/division show even when not in current page.
  const selectedList = useMemo(() => {
    return selectedPlayers.map((sp) => {
      const player =
        selectedPlayerDetails[sp.player_id] ||
        items.find((p) => p.id === sp.player_id) || {
        id: sp.player_id,
        full_name: `Player ${sp.player_id}`,
      };
      return { ...sp, player, isSelected: true };
    });
  }, [selectedPlayers, selectedPlayerDetails, items]);

  const availableFromItems = useMemo(() => {
    return items.filter((p) => !isPlayerDisabled(p.id)).map((player) => ({ player, isSelected: false }));
  }, [items, isPlayerDisabled]);

  const playersToDisplay = useMemo(() => {
    return [...selectedList, ...availableFromItems];
  }, [selectedList, availableFromItems]);

  if (!isOpen) return null;

  return (
    <div className="session-players-drawer-backdrop" onClick={onClose}>
      <div
        className="session-players-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Add Players to League"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="session-players-drawer-header">
          <h2>Add Players to League</h2>
          <button className="session-players-drawer-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="session-players-drawer-body">
          <div className="add-players-search-section">
            <div className="session-players-filters-row">
              <input
                id="player-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name..."
                className="form-input session-players-search"
                aria-label="Search players by name"
              />
              <div className="session-players-filters-trigger-wrap" ref={filterButtonRef}>
                <button
                  type="button"
                  className="session-players-filters-toggle"
                  onClick={() => setFiltersOpen((prev) => !prev)}
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
                    onToggleFilter={handleToggleFilter}
                    userLocationId={currentUserPlayer?.location_id}
                  />
                )}
              </div>
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
            </div>

            {showCreateForm && (
              <div className="session-players-create-form-wrap">
                <div className="session-players-create-form">
                  <input
                    ref={createInputRef}
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleCreateFormSubmit(); }
                      if (e.key === 'Escape') { setShowCreateForm(false); setNewPlayerName(''); }
                    }}
                    placeholder="Player name"
                    className="session-players-create-input"
                    autoComplete="off"
                  />
                </div>

                {isCreateSearching && (
                  <div className="session-players-create-search-results">
                    <span className="session-players-create-search-label">Searching...</span>
                  </div>
                )}

                {!isCreateSearching && createSearchResults.length > 0 && (
                  <div className="session-players-create-search-results">
                    <span className="session-players-create-search-label">Did you mean one of these?</span>
                    {createSearchResults.map((result) => (
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
                          onClick={() => handleAddPlayer(result)}
                          aria-label={`Add ${result.full_name}`}
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
                  onClick={handleCreateFormSubmit}
                  disabled={isCreatingPlaceholder || newPlayerName.trim().length < 2}
                >
                  {isCreatingPlaceholder
                    ? 'Creating...'
                    : createSearchResults.length > 0
                      ? 'None of these — Create & Add'
                      : 'Create & Add'
                  }
                </button>
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <div className="session-players-filter-pills" role="group" aria-label="Active filters">
              {locationIds.map((id) => {
                const loc = locations.find((l) => l.id === id);
                return (
                  <span key={`loc-${id}`} className="session-players-filter-pill">
                    <span>{loc?.name || id}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFilter('location', id)}
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
                      onClick={() => handleRemoveFilter('league', id)}
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
                      onClick={() => handleRemoveFilter('gender', g)}
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
                      onClick={() => handleRemoveFilter('level', l)}
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

          <div className={`add-players-table-section${loading && playersToDisplay.length > 0 ? ' session-players-loading-fade' : ''}`}>
            {loading && playersToDisplay.length === 0 ? (
              <p>Loading players...</p>
            ) : playersToDisplay.length === 0 ? (
              <p className="modal-hint">
                {hasActiveFilters || searchTerm.trim()
                  ? 'No players match. Try different filters or search.'
                  : 'All available players are already in this league.'}
              </p>
            ) : (
              <>
                <div className="add-players-table">
                  {playersToDisplay.map((item) => {
                    const player = item.player;
                    const playerName = getPlayerDisplayName(player);
                    const isSelected = item.isSelected;
                    const division = formatDivisionLabel(player.gender, player.level);

                    return (
                      <div
                        key={isSelected ? `sel-${item.player_id}` : `avail-${player.id}`}
                        className={`add-players-table-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => !isSelected && handleAddPlayer(player)}
                      >
                        <div className="add-players-table-name">
                          <span>{playerName}</span>
                          {!isSelected && division && (
                            <span className="add-players-table-meta" aria-hidden="true">
                              {division}
                            </span>
                          )}
                        </div>
                        <div className="add-players-table-actions">
                          {isSelected ? (
                            <>
                              <select
                                value={item.role}
                                onChange={(e) =>
                                  handleChangeRole(item.player_id, e.target.value)
                                }
                                className="league-role-select"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {ROLE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="add-players-table-remove"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemovePlayer(item.player_id);
                                }}
                                title="Remove from selection"
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <button
                              className="add-players-table-add"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddPlayer(player);
                              }}
                              title="Add to selection"
                            >
                              <Plus size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {hasMore && (
                  <button
                    type="button"
                    className="session-players-load-more"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="session-players-drawer-actions">
          <button className="league-text-button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="league-text-button primary"
            onClick={handleSubmit}
            disabled={selectedPlayers.length === 0 || submitting}
          >
            {submitting ? 'Adding…' : 'Add Players'}
          </button>
        </div>
      </div>
      <PlaceholderCreateModal
        isOpen={!!createModalState}
        playerName={createModalState?.name || ''}
        onCreate={handleCreatePlaceholder}
        onClose={handleCreateModalClose}
      />
    </div>
  );
}
