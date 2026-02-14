'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, MapPin, X } from 'lucide-react';
import NavBar from '../layout/NavBar';
import HomeMenuBar from '../home/HomeMenuBar';
import LevelBadge from '../ui/LevelBadge';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';
import { getPublicPlayers, getLocations, getUserLeagues, createLeague } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { slugify } from '../../utils/slugify';
import { formatGender } from '../../utils/formatters';
import { PLAYER_LEVEL_FILTER_OPTIONS } from '../../utils/playerFilterOptions';
import './FindPlayersPage.css';

/** Max players per page. */
const PAGE_SIZE = 25;

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
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  // Fetch players when filters, search, or page change
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        setLoading(true);
        const params = {
          ...filters,
          page,
          page_size: PAGE_SIZE,
        };
        if (locationIds.length > 0) {
          params.location_id = locationIds.join(',');
        }
        if (debouncedSearch.trim()) {
          params.search = debouncedSearch.trim();
        }
        const data = await getPublicPlayers(params);
        setPlayers(data.items || []);
        setTotalCount(data.total_count || 0);
      } catch (err) {
        console.error('Error fetching players:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlayers();
  }, [filters, locationIds, debouncedSearch, page]);

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
    setSearchQuery('');
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

  const hasActiveFilters = Object.keys(filters).length > 0 || locationIds.length > 0 || searchQuery.trim();
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

                {/* Search + Filters */}
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

                  <div className="find-players__filters">
                    <SearchableMultiSelect
                      label="Location"
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

                    <select
                      value={filters.gender || ''}
                      onChange={(e) => handleFilterChange('gender', e.target.value)}
                      className="find-players__select"
                    >
                      <option value="">All Genders</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>

                    <select
                      value={filters.level || ''}
                      onChange={(e) => handleFilterChange('level', e.target.value)}
                      className="find-players__select"
                    >
                      {PLAYER_LEVEL_FILTER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>

                    {hasActiveFilters && (
                      <button className="find-players__clear-btn" onClick={clearFilters}>
                        Clear filters
                      </button>
                    )}
                  </div>
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
                    <p className="find-players__count">
                      {totalCount} player{totalCount !== 1 ? 's' : ''} found
                    </p>
                    <div className="find-players__grid">
                      {players.map((player) => (
                        <Link
                          key={player.id}
                          href={`/player/${player.id}/${slugify(player.full_name)}`}
                          className="find-players__card"
                        >
                          <div className="find-players__card-avatar">
                            {player.avatar && (player.avatar.startsWith('http') || player.avatar.startsWith('/'))
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
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="find-players__pagination">
                        <button
                          className="find-players__page-btn"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          Previous
                        </button>
                        <span className="find-players__page-info">
                          Page {page} of {totalPages}
                        </span>
                        <button
                          className="find-players__page-btn"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          Next
                        </button>
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
