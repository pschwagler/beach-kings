'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Plus, Filter } from 'lucide-react';
import {
  getPlayers,
  addLeagueMembersBatch,
  getLocations,
  listLeagues,
} from '../../services/api';
import { getPlayerDisplayName, ROLE_OPTIONS } from './utils/leagueUtils';
import { useLeague } from '../../contexts/LeagueContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { GENDER_FILTER_OPTIONS, LEVEL_FILTER_OPTIONS } from '../../utils/playerFilterOptions';
import { formatDivisionLabel } from '../../utils/divisionUtils';
import PlayerFilterPopover from '../session/PlayerFilterPopover';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Modal to add multiple players to a league. Supports search, filters
 * (Location, League, Gender, Level), and batch submit. Uses batch API
 * and shows added/failed counts on partial failure.
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
  const debounceRef = useRef(null);
  const filterButtonRef = useRef(null);
  const filterPopoverRef = useRef(null);

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

  // Reset state when modal closes; default location filter to user's location
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

  // Body class for iOS z-index
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (isOpen) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
    return () => {
      if (typeof document !== 'undefined') document.body.classList.remove('modal-open');
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-players-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Players to League</h2>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
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
            </div>
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
        <div className="modal-actions">
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
    </div>
  );
}
