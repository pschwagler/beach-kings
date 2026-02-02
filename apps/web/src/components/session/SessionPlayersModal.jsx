'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import { getPlayers, inviteToSession, removeSessionParticipant, getLocations, listLeagues } from '../../services/api';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

export default function SessionPlayersModal({
  isOpen,
  sessionId,
  participants = [],
  onClose,
  onSuccess,
  showMessage,
  message,
}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [locationId, setLocationId] = useState('');
  const [leagueId, setLeagueId] = useState('');
  const [locations, setLocations] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [removingId, setRemovingId] = useState(null);
  const [addingIds, setAddingIds] = useState(new Set());
  const debounceRef = useRef(null);

  const participantIds = useMemo(() => new Set((participants || []).map((p) => p.player_id)), [participants]);

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

  // Load locations and leagues when modal opens
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
        location_id: locationId || undefined,
        league_id: leagueId || undefined,
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
    [debouncedQ, locationId, leagueId, showMessage]
  );

  // Initial load and when filters change
  useEffect(() => {
    if (!isOpen) return;
    setOffset(0);
    fetchPage(0, false);
  }, [isOpen, debouncedQ, locationId, leagueId, fetchPage]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setDebouncedQ('');
      setLocationId('');
      setLeagueId('');
      setItems([]);
      setTotal(0);
      setOffset(0);
      setRemovingId(null);
      setAddingIds(new Set());
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (isOpen) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [isOpen]);

  const availableToAdd = useMemo(() => items.filter((p) => !participantIds.has(p.id)), [items, participantIds]);
  const hasMore = items.length < total;

  const handleLoadMore = () => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchPage(nextOffset, true);
  };

  const handleRemove = async (playerId) => {
    if (!sessionId || removingId) return;
    setRemovingId(playerId);
    try {
      await removeSessionParticipant(sessionId, playerId);
      onSuccess?.();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Could not remove player');
    } finally {
      setRemovingId(null);
    }
  };

  const handleAdd = async (player) => {
    if (!sessionId || addingIds.has(player.id)) return;
    setAddingIds((prev) => new Set(prev).add(player.id));
    try {
      await inviteToSession(sessionId, player.id);
      onSuccess?.();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Could not add player');
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(player.id);
        return next;
      });
    }
  };

  const handleFilterChange = (key, value) => {
    if (key === 'location') setLocationId(value || '');
    if (key === 'league') setLeagueId(value || '');
    setOffset(0);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content add-players-modal session-players-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage players</h2>
          <button type="button" className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {participants.length < 4 && (
            <p className="session-players-modal-intro">
              Players with the session link can see the session and log their own games. You need to add players to the
              session before you can add them to a match.
            </p>
          )}
          <section className="session-players-current">
            <h3>In this session</h3>
            {participants.length === 0 ? (
              <p className="secondary-text">No players yet. Add players below.</p>
            ) : (
              <ul className="session-players-list">
                {participants.map((p) => (
                  <li key={p.player_id} className="session-players-list-item">
                    <span>{p.full_name || p.player_name || `Player ${p.player_id}`}</span>
                    <button
                      type="button"
                      className="session-players-remove"
                      onClick={() => handleRemove(p.player_id)}
                      disabled={!!removingId}
                      title="Remove from session (only if they have no games in this session)"
                    >
                      <X size={14} /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="session-players-add">
            <h3>Add player</h3>
            <div className="session-players-filters">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name..."
                className="form-input"
              />
              <select
                className="form-input form-select"
                value={locationId}
                onChange={(e) => handleFilterChange('location', e.target.value)}
                style={{ minWidth: '120px' }}
              >
                <option value="">All locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name || loc.id}
                  </option>
                ))}
              </select>
              <select
                className="form-input form-select"
                value={leagueId}
                onChange={(e) => handleFilterChange('league', e.target.value)}
                style={{ minWidth: '120px' }}
              >
                <option value="">All leagues</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name || l.id}
                  </option>
                ))}
              </select>
            </div>
            {loading ? (
              <p className="session-players-empty">Loading players...</p>
            ) : (
              <>
                <ul className="session-players-add-list">
                  {availableToAdd.length === 0 ? (
                    <li className="session-players-empty">
                      {searchTerm.trim() || locationId || leagueId
                        ? 'No players match. Try different filters.'
                        : 'No other players to add.'}
                    </li>
                  ) : (
                    availableToAdd.map((player) => (
                      <li key={player.id} className="session-players-add-item">
                        <span>{player.name || player.full_name || player.nickname || `Player ${player.id}`}</span>
                        <button
                          type="button"
                          className="session-players-add-btn"
                          onClick={() => handleAdd(player)}
                          disabled={addingIds.has(player.id)}
                          title="Add to session"
                        >
                          <Plus size={16} /> Add
                        </button>
                      </li>
                    ))
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
          </section>
        </div>
        <div className="modal-actions">
          {message && (
            <div className="session-players-message" role="alert">
              {message}
            </div>
          )}
          <button type="button" className="league-text-button primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
