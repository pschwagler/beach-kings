'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getPlayers, inviteToSessionBatch, removeSessionParticipant, getLocations, listLeagues, createPlaceholderPlayer, getPublicPlayers } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import type { Location, League } from '../../../types';
import type { SessionParticipant } from '../types';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/** A player item returned from the players search API. */
interface PlayerItem {
  id: number;
  name?: string | null;
  full_name?: string | null;
  level?: string | null;
  gender?: string | null;
  location_name?: string | null;
  is_placeholder?: boolean;
  [key: string]: unknown;
}


/** An invite failure entry from the batch invite API. */
interface InviteFailure {
  player_id: number;
  error?: string;
  [key: string]: unknown;
}

/** Optional extras for creating a placeholder player. */
interface PlaceholderExtras {
  gender?: string;
  level?: string;
  [key: string]: unknown;
}

/**
 * Encapsulates state and logic for the Session Players modal: local participants,
 * add/remove handlers, search/filters, player list fetch, and batch invite on close.
 *
 * @param {Object} opts
 * @param {boolean} opts.isOpen
 * @param {number|null} opts.sessionId
 * @param {Array} opts.participants
 * @param {function()} [opts.onSuccess]
 * @param {function()} [opts.onClose]
 * @returns {Object} State and handlers for SessionPlayersModal and its panels
 */
interface UseSessionPlayersModalParams {
  isOpen: boolean;
  sessionId: number | null;
  participants?: SessionParticipant[];
  onSuccess?: () => void;
  onClose?: () => void;
}

export function useSessionPlayersModal({
  isOpen,
  sessionId,
  participants = [],
  onSuccess,
  onClose,
}: UseSessionPlayersModalParams) {
  const { showToast } = useToast();
  const { currentUserPlayer } = useAuth();
  const defaultLocationIds = useMemo(
    () => (currentUserPlayer?.location_id ? [currentUserPlayer.location_id] : []),
    [currentUserPlayer]
  );

  const [localParticipants, setLocalParticipants] = useState<SessionParticipant[]>([]);
  const [items, setItems] = useState<PlayerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [leagueIds, setLeagueIds] = useState<number[]>([]);
  const [genderFilters, setGenderFilters] = useState<string[]>([]);
  const [levelFilters, setLevelFilters] = useState<string[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [pendingAddIds, setPendingAddIds] = useState(new Set<number>());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerView, setDrawerView] = useState('add-player');
  const [isCreatingPlaceholder, setIsCreatingPlaceholder] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOpenRef = useRef<boolean>(false);
  const hasMutatedRef = useRef<boolean>(false);
  const filterButtonRef = useRef<HTMLDivElement | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) setDrawerView('add-player');
  }, [isOpen]);

  useEffect(() => {
    if (!filtersOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filterPopoverRef.current?.contains(e.target as Node) || filterButtonRef.current?.contains(e.target as Node)) return;
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
    async (pageOffset: number, append = false) => {
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
        const list: PlayerItem[] = Array.isArray(data?.items) ? data.items : [];
        const count = typeof data?.total_count === 'number' ? data.total_count : 0;
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
          const added: unknown[] = result?.added ?? [];
          const failed: InviteFailure[] = result?.failed ?? [];
          if (failed.length > 0) {
            const failedIds = new Set(failed.map((f) => f.player_id));
            setLocalParticipants((prev) => prev.filter((p) => !failedIds.has(p.player_id)));
            setPendingAddIds(new Set());
            const msg =
              added.length > 0
                ? `${added.length} added; ${failed.length} failed (e.g. ${failed[0].error})`
                : failed.map((f) => f.error).join('; ');
            showToast(msg, 'error');
          }
          if (added.length > 0) hasMutatedRef.current = true;
        } catch (err) {
          const apiErr = err as { response?: { data?: { detail?: string } }; message?: string };
          const detail = apiErr.response?.data?.detail || apiErr.message || 'Failed to add players';
          showToast(detail, 'error');
        }
      }
      if (hasMutatedRef.current) onSuccess?.();
      onClose?.();
    },
    [pendingAddIds, sessionId, showToast, onSuccess, onClose]
  );

  const handleRemove = useCallback(
    async (playerId: number) => {
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
        const apiErr = err as { response?: { data?: { detail?: string } }; message?: string };
        const detail = apiErr.response?.data?.detail || '';
        let msg = 'Could not remove player';
        if (detail.includes('has games') || detail.includes('has matches')) {
          msg = 'Cannot remove player - they have recorded games in this session';
        } else if (detail.includes('not in roster')) {
          msg = 'Player is not in the session roster';
        } else if (detail.includes('creator cannot remove')) {
          msg = 'Session creator cannot be removed from the session';
        } else if (detail) msg = detail;
        showToast(msg, 'error');
      } finally {
        setRemovingId(null);
      }
    },
    [sessionId, removingId, pendingAddIds, showToast]
  );

  const handleAdd = useCallback((player: PlayerItem) => {
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
        is_placeholder: player.is_placeholder,
      },
    ]);
  }, [sessionId, pendingAddIds]);

  const handleRemoveFilter = useCallback((key: string, value: string | number) => {
    if (key === 'location') setLocationIds((prev) => prev.filter((id) => id !== value));
    if (key === 'league') setLeagueIds((prev) => prev.filter((id) => id !== value));
    if (key === 'gender') setGenderFilters((prev) => prev.filter((g) => g !== value));
    if (key === 'level') setLevelFilters((prev) => prev.filter((l) => l !== value));
    setOffset(0);
  }, []);

  /**
   * Create a placeholder player, add to session, and return invite data for the modal.
   * @param {string} name - Player name
   * @param {Object} [extras] - Optional gender/level
   * @returns {Promise<{value: number, label: string, name: string, inviteUrl: string, inviteToken: string}|null>}
   */
  const handleCreatePlaceholder = useCallback(async (name: string, extras: PlaceholderExtras = {}) => {
    if (!sessionId || !name?.trim() || isCreatingPlaceholder) return null;
    setIsCreatingPlaceholder(true);
    try {
      const response = await createPlaceholderPlayer({
        name: name.trim(),
        gender: extras.gender || undefined,
        level: extras.level || undefined,
      });
      const newPlayer: PlayerItem = {
        id: response.player_id,
        name: response.name,
        full_name: response.name,
        is_placeholder: true,
      };
      handleAdd(newPlayer);
      showToast(`${response.name} created and added to session`, 'success');
      return {
        value: response.player_id,
        label: response.name,
        name: response.name,
        inviteUrl: response.invite_url,
        inviteToken: response.invite_token,
        isPlaceholder: true,
      };
    } catch (err) {
      const apiErr = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail = apiErr.response?.data?.detail || 'Failed to create player';
      showToast(detail, 'error');
      throw new Error(detail);
    } finally {
      setIsCreatingPlaceholder(false);
    }
  }, [sessionId, isCreatingPlaceholder, handleAdd, showToast]);

  /**
   * Search registered players by name for duplicate checking in the create form.
   * Maps PublicPlayerResponse to the flat shape SessionPlayersAddPanel expects
   * (location_name instead of location.name).
   * @param {string} query - Search term
   * @returns {Promise<{items: Array<{id, full_name, location_name, gender, level}>}>}
   */
  const handleSearchPlayers = useCallback(async (query: string) => {
    const result = await getPublicPlayers({ search: query, page_size: 5 });
    return {
      items: result.items.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        location_name: p.location?.name ?? null,
        gender: p.gender ?? null,
        level: p.level ?? null,
      })),
    };
  }, []);

  const handleToggleFilter = useCallback((key: string, value: string | number) => {
    if (key === 'location') {
      setLocationIds((prev) =>
        prev.includes(value as string) ? prev.filter((id) => id !== value) : [...prev, value as string]
      );
    }
    if (key === 'league') {
      const id = Number(value);
      setLeagueIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    }
    if (key === 'gender') {
      setGenderFilters((prev) =>
        prev.includes(value as string) ? prev.filter((g) => g !== value) : [...prev, value as string]
      );
    }
    if (key === 'level') {
      setLevelFilters((prev) =>
        prev.includes(value as string) ? prev.filter((l) => l !== value) : [...prev, value as string]
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
    handleCreatePlaceholder,
    isCreatingPlaceholder,
    handleSearchPlayers,
    userLocationId: currentUserPlayer?.location_id || null,
  };
}
