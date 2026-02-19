'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, MapPin, X, LayoutGrid, List, Filter, ChevronUp, ChevronDown } from 'lucide-react';
import NavBar from '../layout/NavBar';
import HomeMenuBar from '../home/HomeMenuBar';
import LevelBadge from '../ui/LevelBadge';
import { Button } from '../ui/UI';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';
import { getPublicPlayers, getLocations, getUserLeagues, createLeague, batchFriendStatus } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { slugify } from '../../utils/slugify';
import { isImageUrl } from '../../utils/avatar';
import { formatGender } from '../../utils/formatters';
import { PLAYER_LEVEL_FILTER_OPTIONS } from '../../utils/playerFilterOptions';
import './FindPlayersPage.css';

/** Max players per page. */
const PAGE_SIZE = 25;

/** Natural default sort direction per field. */
const DEFAULT_SORT_DIR = { name: 'asc', games: 'desc', rating: 'desc' };

/** Sortable column definitions (key → API sort_by value). */
const SORTABLE_COLUMNS = { name: 'name', games: 'games', rating: 'rating' };

/**
 * Renders a friend connection badge for a player card in search results.
 */
function FriendBadge({ friendStatuses, playerId }) {
  if (!friendStatuses) return null;
  const status = friendStatuses.statuses?.[String(playerId)];
  const mutualCount = friendStatuses.mutual_counts?.[String(playerId)] || 0;
  if (status === 'friend') return <span className="find-players__card-badge find-players__card-badge--friend">Friend</span>;
  if (status === 'pending_outgoing') return <span className="find-players__card-badge find-players__card-badge--pending">Request Sent</span>;
  if (status === 'pending_incoming') return <span className="find-players__card-badge find-players__card-badge--incoming">Wants to connect</span>;
  if (mutualCount > 0) return <span className="find-players__card-badge find-players__card-badge--mutual">{mutualCount} mutual friend{mutualCount !== 1 ? 's' : ''}</span>;
  return null;
}

/**
 * Reads recognized filter keys from URL search params.
 */
function parseInitialFilters(searchParams) {
  const keys = ['gender', 'level'];
  const filters = {};
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) filters[key] = value;
  }
  return filters;
}

/**
 * Returns a human-readable label for a filter value.
 */
function getFilterDisplayValue(key, value) {
  if (key === 'gender') return formatGender(value);
  if (key === 'level') {
    const opt = PLAYER_LEVEL_FILTER_OPTIONS.find((o) => o.value === value);
    return opt ? opt.label : value;
  }
  return value;
}

/**
 * Sortable table header button.
 */
function SortableHeader({ label, columnKey, sortBy, sortDir, onSort }) {
  const isActive = sortBy === columnKey;
  return (
    <button
      className={`find-players__th-sort ${isActive ? 'find-players__th-sort--active' : ''}`}
      onClick={() => onSort(columnKey)}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {isActive && (
        <span className="find-players__sort-icon">
          {sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      )}
    </button>
  );
}

/**
 * Public-facing page for searching and discovering players.
 * Works for both authenticated and unauthenticated users.
 */
export default function FindPlayersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const [userLeagues, setUserLeagues] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(() => parseInitialFilters(searchParams));
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [locations, setLocations] = useState([]);
  const [locationIds, setLocationIds] = useState(() => {
    const initial = searchParams.get('location_id');
    return initial ? initial.split(',') : [];
  });
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'games');
  const [sortDir, setSortDir] = useState(() => DEFAULT_SORT_DIR[searchParams.get('sort') || 'games']);
  const [minGames, setMinGames] = useState('');
  const [debouncedMinGames, setDebouncedMinGames] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('find_players_view') || 'table';
    }
    return 'table';
  });
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [friendStatuses, setFriendStatuses] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPanelRef = useRef(null);

  // Close filter panel on outside click
  useEffect(() => {
    if (!isFilterOpen) return;
    const handleClickOutside = (e) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Debounce min games input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMinGames(minGames), 400);
    return () => clearTimeout(timer);
  }, [minGames]);

  // Load user leagues for navbar
  useEffect(() => {
    if (!isAuthenticated) return;
    getUserLeagues()
      .then(setUserLeagues)
      .catch((err) => console.error('Error loading user leagues:', err));
  }, [isAuthenticated]);

  // Load locations for filter dropdown
  useEffect(() => {
    getLocations()
      .then((data) => setLocations(data || []))
      .catch((err) => console.error('Error loading locations:', err));
  }, []);

  // Fetch players when filters, search, sort, or page change
  useEffect(() => {
    const controller = new AbortController();
    const fetchPlayers = async () => {
      try {
        setLoading(true);
        const params = {
          ...filters,
          page,
          page_size: PAGE_SIZE,
          sort_by: sortBy,
          sort_dir: sortDir,
        };
        if (locationIds.length > 0) {
          params.location_id = locationIds.join(',');
        }
        if (debouncedSearch.trim()) {
          params.search = debouncedSearch.trim();
        }
        if (debouncedMinGames && parseInt(debouncedMinGames, 10) >= 1) {
          params.min_games = parseInt(debouncedMinGames, 10);
        }
        const data = await getPublicPlayers(params, { signal: controller.signal });
        setPlayers(data.items || []);
        setTotalCount(data.total_count || 0);
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'CanceledError') return;
        console.error('Error fetching players:', err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchPlayers();
    return () => controller.abort();
  }, [filters, locationIds, debouncedSearch, sortBy, sortDir, debouncedMinGames, page]);

  // Fetch friend statuses when players load (authenticated only)
  useEffect(() => {
    if (!isAuthenticated || players.length === 0) {
      setFriendStatuses(null);
      return;
    }
    const playerIds = players.map((p) => p.id);
    batchFriendStatus(playerIds)
      .then(setFriendStatuses)
      .catch((err) => console.error('Error fetching friend statuses:', err));
  }, [isAuthenticated, players]);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      router.push('/');
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'view-league' && leagueId) {
      router.push(`/league/${leagueId}`);
    } else if (action === 'create-league') {
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSubmit: async (leagueData) => {
          const newLeague = await createLeague(leagueData);
          const leagues = await getUserLeagues();
          setUserLeagues(leagues);
          router.push(`/league/${newLeague.id}?tab=details`);
        },
      });
    }
  };

  const handleFilterChange = useCallback((key, value) => {
    setPage(1);
    setFilters((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setPage(1);
    setFilters({});
    setLocationIds([]);
    setMinGames('');
    setDebouncedMinGames('');
    setSearchQuery('');
    setSortBy('games');
    setSortDir(DEFAULT_SORT_DIR['games']);
  }, []);

  /** Handle sortable column header click. */
  const handleSort = useCallback((columnKey) => {
    setPage(1);
    if (columnKey === sortBy) {
      // Same column — flip direction
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      // New column — use natural default direction
      setSortBy(columnKey);
      setSortDir(DEFAULT_SORT_DIR[columnKey]);
    }
  }, [sortBy]);

  /** Remove a single filter pill. */
  const removeFilter = useCallback((key) => {
    setPage(1);
    if (key === 'location') {
      setLocationIds([]);
    } else if (key === 'minGames') {
      setMinGames('');
    } else {
      setFilters((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, []);

  const userLocationId = currentUserPlayer?.location_id;
  const locationOptions = useMemo(() => {
    const opts = (locations || []).map((l) => ({ id: l.id, label: l.name || l.id }));
    if (!userLocationId) return opts;
    return opts.sort((a, b) => {
      if (a.id === userLocationId) return -1;
      if (b.id === userLocationId) return 1;
      return 0;
    });
  }, [locations, userLocationId]);

  // Build active filter pills
  const filterPills = useMemo(() => {
    const pills = [];
    if (locationIds.length > 0) {
      const names = locationIds.map((id) => {
        const loc = locationOptions.find((o) => o.id === id);
        return loc ? loc.label : id;
      });
      pills.push({ key: 'location', label: 'Location', value: names.join(', ') });
    }
    if (filters.gender) {
      pills.push({ key: 'gender', label: 'Gender', value: getFilterDisplayValue('gender', filters.gender) });
    }
    if (filters.level) {
      pills.push({ key: 'level', label: 'Level', value: getFilterDisplayValue('level', filters.level) });
    }
    if (minGames && parseInt(minGames, 10) >= 1) {
      pills.push({ key: 'minGames', label: 'Min Games', value: `${minGames}+` });
    }
    return pills;
  }, [filters, locationIds, locationOptions, minGames]);

  const activeFilterCount = filterPills.length;
  const hasActiveFilters = activeFilterCount > 0 || searchQuery.trim();
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
      />
      <div className="league-dashboard-container">
        <div className="league-dashboard">
          {isAuthenticated && <HomeMenuBar activeTab={null} />}

          <main className={isAuthenticated ? 'home-content' : 'home-content home-content--no-sidebar'}>
            <div className="profile-page-content">
              <div className="league-section find-players-page">
                <div className="section-header">
                  <h1 className="section-title">Find Players</h1>
                </div>

                {!isAuthenticated && (
                  <div className="find-leagues-auth-prompt">
                    <span className="find-leagues-auth-prompt__text">
                      <button className="find-leagues-auth-prompt__link" onClick={() => openAuthModal('sign-in')} aria-label="Log in to Beach League">Log in</button>
                      {' or '}
                      <button className="find-leagues-auth-prompt__link" onClick={() => openAuthModal('sign-up')} aria-label="Sign up for Beach League">sign up</button>
                      {' to join leagues and track your stats'}
                    </span>
                  </div>
                )}

                {/* Search bar */}
                <div className="find-players__controls">
                  <div className="find-players__search">
                    <Search size={16} className="find-players__search-icon" />
                    <input
                      type="text"
                      placeholder="Search players..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      className="find-players__search-input"
                    />
                    {searchQuery && (
                      <button
                        className="find-players__search-clear"
                        onClick={() => { setSearchQuery(''); setPage(1); }}
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Toolbar: filter button + view toggle + result count */}
                  <div className="find-players__toolbar">
                    <div className="find-players__toolbar-left">
                      <div className="find-players__filter-btn-wrapper" ref={filterPanelRef}>
                        <button
                          className={`find-players__filter-btn ${isFilterOpen ? 'find-players__filter-btn--active' : ''}`}
                          onClick={() => setIsFilterOpen((o) => !o)}
                          aria-label="Toggle filters"
                        >
                          <Filter size={16} />
                          <span>Filter &amp; Sort</span>
                          {activeFilterCount > 0 && (
                            <span className="find-players__filter-badge">{activeFilterCount}</span>
                          )}
                        </button>

                        {isFilterOpen && (
                          <div className="find-players__filter-panel">
                            <div className="find-players__filter-group">
                              <label className="find-players__filter-label">Location</label>
                              <SearchableMultiSelect
                                label=""
                                options={locationOptions}
                                selectedIds={locationIds}
                                onToggle={(id) => {
                                  setPage(1);
                                  setLocationIds((prev) =>
                                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                  );
                                }}
                                placeholder="Search locations..."
                              />
                            </div>

                            <div className="find-players__filter-group">
                              <label className="find-players__filter-label">Gender</label>
                              <select
                                value={filters.gender || ''}
                                onChange={(e) => handleFilterChange('gender', e.target.value)}
                                className="find-players__filter-select"
                              >
                                <option value="">All Genders</option>
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                              </select>
                            </div>

                            <div className="find-players__filter-group">
                              <label className="find-players__filter-label">Level</label>
                              <select
                                value={filters.level || ''}
                                onChange={(e) => handleFilterChange('level', e.target.value)}
                                className="find-players__filter-select"
                              >
                                {PLAYER_LEVEL_FILTER_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>

                            <div className="find-players__filter-group">
                              <label className="find-players__filter-label">Min Games</label>
                              <input
                                type="number"
                                min="1"
                                placeholder="e.g. 10"
                                value={minGames}
                                onChange={(e) => { setMinGames(e.target.value); setPage(1); }}
                                className="find-players__filter-input"
                              />
                            </div>

                            <div className="find-players__filter-divider" />

                            <div className="find-players__filter-group">
                              <label className="find-players__filter-label">Sort By</label>
                              <select
                                value={sortBy}
                                onChange={(e) => {
                                  const col = e.target.value;
                                  setSortBy(col);
                                  setSortDir(DEFAULT_SORT_DIR[col]);
                                  setPage(1);
                                }}
                                className="find-players__filter-select"
                              >
                                <option value="games">Most Games</option>
                                <option value="name">Name</option>
                                <option value="rating">Rating</option>
                              </select>
                            </div>

                            <div className="find-players__filter-group">
                              <label className="find-players__filter-label">Direction</label>
                              <select
                                value={sortDir}
                                onChange={(e) => { setSortDir(e.target.value); setPage(1); }}
                                className="find-players__filter-select"
                              >
                                <option value="desc">Descending</option>
                                <option value="asc">Ascending</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      {hasActiveFilters && (
                        <Button variant="ghost" onClick={clearFilters} className="find-players__clear-btn">
                          Clear all
                        </Button>
                      )}
                    </div>

                    <div className="find-players__toolbar-right">
                      <p className="find-players__count">
                        {totalCount} player{totalCount !== 1 ? 's' : ''}
                      </p>
                      <div className="find-players__view-toggle">
                        <button
                          className={`find-players__view-btn ${viewMode === 'table' ? 'find-players__view-btn--active' : ''}`}
                          onClick={() => { setViewMode('table'); localStorage.setItem('find_players_view', 'table'); }}
                          aria-label="Table view"
                        >
                          <List size={16} />
                        </button>
                        <button
                          className={`find-players__view-btn ${viewMode === 'card' ? 'find-players__view-btn--active' : ''}`}
                          onClick={() => { setViewMode('card'); localStorage.setItem('find_players_view', 'card'); }}
                          aria-label="Card view"
                        >
                          <LayoutGrid size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Filter pills */}
                  {filterPills.length > 0 && (
                    <div className="find-players__filter-pills">
                      {filterPills.map((pill) => (
                        <span key={pill.key} className="find-players__filter-pill">
                          <span className="find-players__filter-pill-label">
                            {pill.label}: {pill.value}
                          </span>
                          <button
                            className="find-players__filter-pill-remove"
                            onClick={() => removeFilter(pill.key)}
                            aria-label={`Remove ${pill.label} filter`}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Results */}
                {loading ? (
                  <div className="loading">Loading players...</div>
                ) : players.length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-state__heading">No players found</p>
                    <p className="empty-state__description">
                      {hasActiveFilters
                        ? 'Try adjusting your search or filters.'
                        : 'No players have played any games yet.'}
                    </p>
                  </div>
                ) : (
                  <>
                    {viewMode === 'table' && (
                      <div className="find-players__table-wrapper">
                        <table className="find-players__table">
                          <thead>
                            <tr>
                              <th>
                                <SortableHeader label="Player" columnKey="name" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                              </th>
                              <th>Location</th>
                              <th>Gender</th>
                              <th>Level</th>
                              <th>
                                <SortableHeader label="Games" columnKey="games" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                              </th>
                              <th>
                                <SortableHeader label="Rating" columnKey="rating" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                              </th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {players.map((player) => (
                              <tr key={player.id} onClick={() => router.push(`/player/${player.id}/${slugify(player.full_name)}`)} className="find-players__table-row">
                                <td>
                                  <div className="find-players__table-player">
                                    <div className="find-players__card-avatar find-players__card-avatar--sm">
                                      {isImageUrl(player.avatar)
                                        ? <img src={player.avatar} alt={player.full_name} className="find-players__card-avatar-img" />
                                        : <span className="find-players__card-avatar-initials">{player.avatar || player.full_name?.charAt(0)}</span>
                                      }
                                    </div>
                                    <span className="find-players__card-name">{player.full_name}</span>
                                  </div>
                                </td>
                                <td className="find-players__table-cell--secondary">{player.location_name || '—'}</td>
                                <td className="find-players__table-cell--secondary">{player.gender ? formatGender(player.gender) : '—'}</td>
                                <td>{player.level ? <LevelBadge level={player.level} /> : '—'}</td>
                                <td className="find-players__table-cell--secondary">{player.total_games}</td>
                                <td className="find-players__table-cell--secondary">{Math.round(player.current_rating || 1200)}</td>
                                <td><FriendBadge friendStatuses={friendStatuses} playerId={player.id} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className={`find-players__grid ${viewMode === 'table' ? 'find-players__grid--mobile-only' : ''}`}>
                      {players.map((player) => (
                        <Link
                          key={player.id}
                          href={`/player/${player.id}/${slugify(player.full_name)}`}
                          className="find-players__card"
                        >
                          <div className="find-players__card-avatar">
                            {isImageUrl(player.avatar)
                              ? <img src={player.avatar} alt={player.full_name} className="find-players__card-avatar-img" />
                              : <span className="find-players__card-avatar-initials">{player.avatar || player.full_name?.charAt(0)}</span>
                            }
                          </div>
                          <div className="find-players__card-info">
                            <span className="find-players__card-name">{player.full_name}</span>
                            {player.location_name && (
                              <span className="find-players__card-location">
                                <MapPin size={12} />
                                {player.location_name}
                              </span>
                            )}
                            <div className="find-players__card-meta">
                              {player.gender && (
                                <span className="find-players__card-gender">{formatGender(player.gender)}</span>
                              )}
                              {player.level && <LevelBadge level={player.level} />}
                              <span className="find-players__card-games">
                                {player.total_games} game{player.total_games !== 1 ? 's' : ''}
                              </span>
                              <span className="find-players__card-rating">
                                {Math.round(player.current_rating || 1200)}
                              </span>
                              <FriendBadge friendStatuses={friendStatuses} playerId={player.id} />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="find-players__pagination">
                        <Button
                          variant="outline"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Previous
                        </Button>
                        <span className="find-players__page-info">
                          Page {page} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
