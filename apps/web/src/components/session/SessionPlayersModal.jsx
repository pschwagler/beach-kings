'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Plus, ChevronDown, Filter, Users, UserPlus, MapPin, Check, Square } from 'lucide-react';
import { getPlayers, inviteToSession, removeSessionParticipant, getLocations, listLeagues } from '../../services/api';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const GENDER_FILTER_OPTIONS = [
  { value: '', label: 'All genders' },
  { value: 'male', label: "Men's" },
  { value: 'female', label: "Women's" },
];

const LEVEL_FILTER_OPTIONS = [
  { value: '', label: 'All levels' },
  { value: 'juniors', label: 'Juniors' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'open', label: 'Open' },
];

/** Format gender + level as "Mens Open" or "Womens Advanced" style label. */
function formatDivisionLabel(gender, level) {
  const g = (gender || '').toLowerCase();
  const l = (level || '').trim();
  const genderLabel = g === 'male' ? 'Mens' : g === 'female' ? 'Womens' : null;
  const levelLabel = l ? l.charAt(0).toUpperCase() + l.slice(1).toLowerCase() : null;
  if (genderLabel && levelLabel) return `${genderLabel} ${levelLabel}`;
  if (genderLabel) return genderLabel;
  if (levelLabel) return levelLabel;
  return null;
}

/**
 * SessionPlayersDrawer manages participants optimistically: add/remove updates local state
 * immediately without triggering parent refetch. Parent is notified only on close (if
 * mutations occurred), avoiding mid-drawer re-renders and layout flash.
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
  const [localParticipants, setLocalParticipants] = useState([]);
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
  const [removingId, setRemovingId] = useState(null);
  const [addingIds, setAddingIds] = useState(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerView, setDrawerView] = useState('add-player'); // 'in-session' | 'add-player'
  const debounceRef = useRef(null);
  const prevOpenRef = useRef(false);
  const hasMutatedRef = useRef(false);
  const drawerRef = useRef(null);
  const filterButtonRef = useRef(null);
  const filterPopoverRef = useRef(null);

  // Reset view when drawer opens
  useEffect(() => {
    if (isOpen) setDrawerView('add-player');
  }, [isOpen]);

  // Close filter popover when clicking outside
  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (e) => {
      const popover = filterPopoverRef.current;
      const button = filterButtonRef.current;
      if (popover?.contains(e.target) || button?.contains(e.target)) return;
      setFiltersOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filtersOpen]);

  // Sync from props only when drawer opens (avoids overwriting optimistic updates)
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = isOpen;
    if (isOpen && !wasOpen) {
      setLocalParticipants(Array.isArray(participants) ? [...participants] : []);
      hasMutatedRef.current = false;
    }
  }, [isOpen, participants]);

  const participantIds = useMemo(
    () => new Set((localParticipants || []).map((p) => p.player_id)),
    [localParticipants]
  );

  const activeFilterCount = useMemo(
    () => locationIds.length + leagueIds.length + genderFilters.length + levelFilters.length,
    [locationIds, leagueIds, genderFilters, levelFilters]
  );

  // Debounce search term
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

  // Load locations and leagues when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    getLocations().then((data) => setLocations(Array.isArray(data) ? data : [])).catch(() => setLocations([]));
    listLeagues().then((data) => setLeagues(Array.isArray(data) ? data : [])).catch(() => setLeagues([]));
  }, [isOpen]);

  // Fetch players (first page or when filters change)
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
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const data = await getPlayers(params);
        const list = Array.isArray(data?.items) ? data.items : [];
        const count = typeof data?.total === 'number' ? data.total : 0;
        if (append) {
          setItems((prev) => [...prev, ...list]);
        } else {
          setItems(list);
        }
        setTotal(count);
      } catch (err) {
        console.error('Error loading players:', err);
        showMessage?.('error', 'Failed to load players');
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ, locationIds, leagueIds, genderFilters, levelFilters, showMessage]
  );

  // Initial load and when filters change
  useEffect(() => {
    if (!isOpen) return;
    setOffset(0);
    fetchPage(0, false);
  }, [isOpen, debouncedQ, locationIds, leagueIds, genderFilters, levelFilters, fetchPage]);

  // Reset when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setDebouncedQ('');
      setLocationIds([]);
      setLeagueIds([]);
      setGenderFilters([]);
      setLevelFilters([]);
      setItems([]);
      setTotal(0);
      setOffset(0);
      setRemovingId(null);
      setAddingIds(new Set());
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isOpen]);

  // Body class and focus trap
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (isOpen) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
    return () => document.body.classList.remove('drawer-open');
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (hasMutatedRef.current) onSuccess?.();
    onClose?.();
  }, [onSuccess, onClose]);

  const availableToAdd = useMemo(() => items.filter((p) => !participantIds.has(p.id)), [items, participantIds]);
  const hasMore = items.length < total;

  const handleLoadMore = () => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchPage(nextOffset, true);
  };

  // Focus close button when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    const el = drawerRef.current?.querySelector('button[aria-label="Close"], .modal-close-button');
    el?.focus();
  }, [isOpen]);

  // Escape key closes drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const handleRemove = async (playerId) => {
    if (!sessionId || removingId) return;
    setRemovingId(playerId);
    try {
      await removeSessionParticipant(sessionId, playerId);
      hasMutatedRef.current = true;
      setLocalParticipants((prev) => prev.filter((p) => p.player_id !== playerId));
    } catch (err) {
      const detail = err.response?.data?.detail || '';
      let msg = 'Could not remove player';
      if (detail.includes('has games') || detail.includes('has matches')) {
        msg = 'Cannot remove player - they have recorded games in this session';
      } else if (detail.includes('not in roster')) {
        msg = 'Player is not in the session roster';
      } else if (detail.includes('creator cannot remove')) {
        msg = 'Session creator cannot be removed from the session';
      } else if (detail) msg = detail;
      showMessage?.('error', msg);
    } finally {
      setRemovingId(null);
    }
  };

  const handleAdd = async (player) => {
    if (!sessionId || addingIds.has(player.id)) return;
    setAddingIds((prev) => new Set(prev).add(player.id));
    try {
      await inviteToSession(sessionId, player.id);
      hasMutatedRef.current = true;
      setLocalParticipants((prev) => [
        ...prev,
        {
          player_id: player.id,
          full_name: player.name || player.full_name || `Player ${player.id}`,
          level: player.level,
          gender: player.gender,
          location_name: player.location_name,
        },
      ]);
    } catch (err) {
      const detail = err.response?.data?.detail || '';
      let msg = 'Could not add player to session';
      if (detail.includes('already')) msg = 'Player is already in the session';
      else if (detail.includes('not found')) msg = 'Player not found';
      else if (detail) msg = detail;
      showMessage?.('error', msg);
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(player.id);
        return next;
      });
    }
  };

  const handleRemoveFilter = (key, value) => {
    if (key === 'location') setLocationIds((prev) => prev.filter((id) => id !== value));
    if (key === 'league') setLeagueIds((prev) => prev.filter((id) => id !== value));
    if (key === 'gender') setGenderFilters((prev) => prev.filter((g) => g !== value));
    if (key === 'level') setLevelFilters((prev) => prev.filter((l) => l !== value));
    setOffset(0);
  };

  /** Toggle a multi-value filter (add if not selected, remove if selected). */
  const handleToggleFilter = (key, value) => {
    if (key === 'location') {
      setLocationIds((prev) =>
        prev.includes(value) ? prev.filter((id) => id !== value) : [...prev, value]
      );
    }
    if (key === 'league') {
      const id = Number(value);
      setLeagueIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      );
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
  };

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
            <section
              id="session-players-in-session-panel"
              role="tabpanel"
              aria-labelledby="session-players-tab-in-session"
              className="session-players-column session-players-in-session"
            >
              <div className="session-players-column-scroll">
                {localParticipants.length === 0 ? (
                  <p className="session-players-empty">No players yet. Switch to &quot;Add players&quot; to add people.</p>
                ) : (
                  <ul className="session-players-list">
                    {localParticipants.map((p) => {
                      const isCreatorRemovingSelf = sessionCreatedByPlayerId != null
                        && currentUserPlayerId != null
                        && p.player_id === sessionCreatedByPlayerId
                        && p.player_id === currentUserPlayerId;
                      const name = p.full_name || p.player_name || `Player ${p.player_id}`;
                      const division = formatDivisionLabel(p.gender, p.level);
                      return (
                        <li key={p.player_id} className="session-players-list-item">
                          <div className="session-players-row-content">
                            <span className="session-players-row-name">{name}</span>
                            <span className="session-players-row-meta-wrap">
                              {division && (
                                <span className="session-players-row-meta" aria-hidden="true">
                                  {division}
                                </span>
                              )}
                              {p.location_name && (
                                <span className="session-players-location-pill" aria-hidden="true">
                                  <MapPin size={12} /> {p.location_name}
                                </span>
                              )}
                            </span>
                          </div>
                          {!isCreatorRemovingSelf ? (
                            <button
                              type="button"
                              className="session-players-remove"
                              onClick={() => handleRemove(p.player_id)}
                              disabled={!!removingId}
                              aria-label={`Remove ${name} from session`}
                              title="Remove from session (only if they have no games in this session)"
                            >
                              <X size={14} /> Remove
                            </button>
                          ) : (
                            <span className="session-players-creator-badge">Creator</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          )}

          {drawerView === 'add-player' && (
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
                    aria-label={filtersOpen ? 'Hide filters' : `Show filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
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
                    <div
                      id="session-players-filters-popover"
                      ref={filterPopoverRef}
                      className="session-players-filters-popover"
                      role="dialog"
                      aria-label="Filter players"
                    >
                      <div className="session-players-filters-panel">
                        <div className="session-players-filter-multiselect" role="group" aria-label="Location filter">
                          <div className="session-players-filter-multiselect-label">Location</div>
                          <ul className="session-players-filter-multiselect-list">
                            {locations.map((loc) => {
                              const selected = locationIds.includes(loc.id);
                              return (
                                <li key={loc.id}>
                                  <button
                                    type="button"
                                    className={`session-players-filter-multiselect-option ${selected ? 'selected' : ''}`}
                                    onClick={() => handleToggleFilter('location', loc.id)}
                                    aria-pressed={selected}
                                    aria-label={`${selected ? 'Remove' : 'Add'} ${loc.name || loc.id} filter`}
                                  >
                                    <span className="session-players-filter-multiselect-check" aria-hidden="true">
                                      {selected ? <Check size={14} strokeWidth={2.5} /> : <Square size={14} strokeWidth={2} />}
                                    </span>
                                    <span>{loc.name || loc.id}</span>
                                  </button>
                                </li>
                              );
                            })}
                            {locations.length === 0 && (
                              <li className="session-players-filter-multiselect-empty">No locations</li>
                            )}
                          </ul>
                        </div>
                        <div className="session-players-filter-multiselect" role="group" aria-label="League filter">
                          <div className="session-players-filter-multiselect-label">League</div>
                          <ul className="session-players-filter-multiselect-list">
                            {leagues.map((l) => {
                              const selected = leagueIds.includes(l.id);
                              return (
                                <li key={l.id}>
                                  <button
                                    type="button"
                                    className={`session-players-filter-multiselect-option ${selected ? 'selected' : ''}`}
                                    onClick={() => handleToggleFilter('league', l.id)}
                                    aria-pressed={selected}
                                    aria-label={`${selected ? 'Remove' : 'Add'} ${l.name || l.id} filter`}
                                  >
                                    <span className="session-players-filter-multiselect-check" aria-hidden="true">
                                      {selected ? <Check size={14} strokeWidth={2.5} /> : <Square size={14} strokeWidth={2} />}
                                    </span>
                                    <span>{l.name || l.id}</span>
                                  </button>
                                </li>
                              );
                            })}
                            {leagues.length === 0 && (
                              <li className="session-players-filter-multiselect-empty">No leagues</li>
                            )}
                          </ul>
                        </div>
                        <div className="session-players-filter-multiselect" role="group" aria-label="Gender filter">
                          <div className="session-players-filter-multiselect-label">Gender</div>
                          <ul className="session-players-filter-multiselect-list">
                            {GENDER_FILTER_OPTIONS.filter((opt) => opt.value).map((opt) => {
                              const selected = genderFilters.includes(opt.value);
                              return (
                                <li key={opt.value}>
                                  <button
                                    type="button"
                                    className={`session-players-filter-multiselect-option ${selected ? 'selected' : ''}`}
                                    onClick={() => handleToggleFilter('gender', opt.value)}
                                    aria-pressed={selected}
                                    aria-label={`${selected ? 'Remove' : 'Add'} ${opt.label} filter`}
                                  >
                                    <span className="session-players-filter-multiselect-check" aria-hidden="true">
                                      {selected ? <Check size={14} strokeWidth={2.5} /> : <Square size={14} strokeWidth={2} />}
                                    </span>
                                    <span>{opt.label}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                        <div className="session-players-filter-multiselect" role="group" aria-label="Level filter">
                          <div className="session-players-filter-multiselect-label">Level</div>
                          <ul className="session-players-filter-multiselect-list">
                            {LEVEL_FILTER_OPTIONS.filter((opt) => opt.value).map((opt) => {
                              const selected = levelFilters.includes(opt.value);
                              return (
                                <li key={opt.value}>
                                  <button
                                    type="button"
                                    className={`session-players-filter-multiselect-option ${selected ? 'selected' : ''}`}
                                    onClick={() => handleToggleFilter('level', opt.value)}
                                    aria-pressed={selected}
                                    aria-label={`${selected ? 'Remove' : 'Add'} ${opt.label} filter`}
                                  >
                                    <span className="session-players-filter-multiselect-check" aria-hidden="true">
                                      {selected ? <Check size={14} strokeWidth={2.5} /> : <Square size={14} strokeWidth={2} />}
                                    </span>
                                    <span>{opt.label}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {(locationIds.length > 0 || leagueIds.length > 0 || genderFilters.length > 0 || levelFilters.length > 0) && (
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

              <div className="session-players-column-scroll session-players-add-list-wrapper">
                {loading ? (
                  <p className="session-players-empty">Loading players...</p>
                ) : (
                  <>
                    <ul className="session-players-add-list">
                      {availableToAdd.length === 0 ? (
                        <li className="session-players-empty">
                          {searchTerm.trim() || locationIds.length || leagueIds.length || genderFilters.length || levelFilters.length
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
                                onClick={() => handleAdd(player)}
                                disabled={addingIds.has(player.id)}
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
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? 'Loading…' : 'Load more'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
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
