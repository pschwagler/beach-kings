'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getPlayers } from '../../../services/api';

const DEBOUNCE_MS = 300;

/**
 * Debounced player search hook wrapping the getPlayers API.
 *
 * @param {Object} opts
 * @param {number} [opts.leagueId] - Optional league to scope results
 * @param {number} [opts.limit] - Max results (default 10)
 * @returns {{ query: string, setQuery: function, results: Array, isLoading: boolean }}
 */
export function usePlayerSearch({ leagueId = null, limit = 10 } = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q || q.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const params = { q: q.trim(), limit };
      if (leagueId) {
        params.league_id = leagueId;
      }
      const data = await getPlayers(params, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setResults(data.items || []);
        setIsLoading(false);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('[usePlayerSearch] Error:', err);
        setResults([]);
        setIsLoading(false);
      }
    }
  }, [leagueId, limit]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (!query || query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    timerRef.current = setTimeout(() => search(query), DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, search]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { query, setQuery, results, isLoading };
}
