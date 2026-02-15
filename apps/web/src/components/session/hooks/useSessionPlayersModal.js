'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getPlayers, inviteToSessionBatch, removeSessionParticipant, getLocations, listLeagues } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Encapsulates state and logic for the Session Players modal: local participants,
 * add/remove handlers, search/filters, player list fetch, and batch invite on close.
 *
 * @param {Object} opts
 * @param {boolean} opts.isOpen
 * @param {number|null} opts.sessionId
 * @param {Array} opts.participants
 * @param {function(string, string)} [opts.showMessage]
 * @param {function()} [opts.onSuccess]
 * @param {function()} [opts.onClose]
 * @returns {Object} State and handlers for SessionPlayersModal and its panels
 */
export function useSessionPlayersModal({
  isOpen,
  sessionId,
  participants = [],
  showMessage,
  onSuccess,
  onClose,
}) {
  const { currentUserPlayer } = useAuth();
  const defaultLocationIds = useMemo(
    () => (currentUserPlayer?.location_id ? [currentUserPlayer.location_id] : []),
    [currentUserPlayer]
  );

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
  const [pendingAddIds, setPendingAddIds] = useState(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerView, setDrawerView] = useState('add-player');
  const debounceRef = useRef(null);
  const prevOpenRef = useRef(false);
  const hasMutatedRef = useRef(false);
  const filterButtonRef = useRef(null);
  const filterPopoverRef = useRef(null);

  useEffect(() => {
    if (isOpen) setDrawerView('add-player');
  }, [isOpen]);

  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (e) => {
      if (filterPopoverRef.current?.contains(e.target) || filterButtonRef.current?.contains(e.target)) return;
      setFiltersOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filtersOpen]);

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

  useEffect(() => {
    if (!isOpen) return;
    getLocations().then((data) => setLocations(Array.isArray(data) ? data : [])).catch(() => setLocations([]));
    listLeagues().then((data) => setLeagues(Array.isArray(data) ? data : [])).catch(() => setLeagues([]));
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
        showMessage?.('error', 'Failed to load players');
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ, locationIds, leagueIds, genderFilters, levelFilters, showMessage]
  );

  useEffect(() => {
    if (!isOpen) return;
    setOffset(0);
    fetchPage(0, false);
  }, [isOpen, debouncedQ, locationIds, leagueIds, genderFilters, levelFilters, fetchPage]);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setDebouncedQ('');
      setLocationIds(defaultLocationIds);
      setLeagueIds([]);
      setGenderFilters([]);
      setLevelFilters([]);
      setItems([]);
      setTotal(0);
      setOffset(0);
      setRemovingId(null);
      setPendingAddIds(new Set());
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isOpen, defaultLocationIds]);

  const hasMore = items.length < total;

  const handleLoadMore = useCallback(() => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchPage(nextOffset, true);
  }, [offset, fetchPage]);

  const handleClose = useCallback(
    async () => {
      const pending = Array.from(pendingAddIds);
      if (pending.length > 0 && sessionId) {
        try {
          const result = await inviteToSessionBatch(sessionId, pending);
          const added = result?.added ?? [];
          const failed = result?.failed ?? [];
          if (failed.length > 0) {
            const failedIds = new Set(failed.map((f) => f.player_id));
            setLocalParticipants((prev) => prev.filter((p) => !failedIds.has(p.player_id)));
            setPendingAddIds(new Set());
            const msg =
              added.length > 0
                ? `${added.length} added; ${failed.length} failed (e.g. ${failed[0].error})`
                : failed.map((f) => f.error).join('; ');
            showMessage?.('error', msg);
          }
          if (added.length > 0) hasMutatedRef.current = true;
        } catch (err) {
          const detail = err.response?.data?.detail || err.message || 'Failed to add players';
          showMessage?.('error', detail);
        }
      }
      if (hasMutatedRef.current) onSuccess?.();
      onClose?.();
    },
    [pendingAddIds, sessionId, showMessage, onSuccess, onClose]
  );

  const handleRemove = useCallback(
    async (playerId) => {
      if (!sessionId || removingId) return;
      if (pendingAddIds.has(playerId)) {
        setPendingAddIds((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
        setLocalParticipants((prev) => prev.filter((p) => p.player_id !== playerId));
        return;
      }
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
    },
    [sessionId, removingId, pendingAddIds, showMessage]
  );

  const handleAdd = useCallback((player) => {
    if (!sessionId || pendingAddIds.has(player.id)) return;
    setPendingAddIds((prev) => new Set(prev).add(player.id));
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
  }, [sessionId, pendingAddIds]);

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

  return {
    localParticipants,
    setDrawerView,
    drawerView,
    items,
    total,
    offset,
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
    userLocationId: currentUserPlayer?.location_id || null,
  };
}
