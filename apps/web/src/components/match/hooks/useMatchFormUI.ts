import { useState, useEffect, useRef } from 'react';

/**
 * Hook to manage UI state for match form (dropdowns, expanded state)
 * Consolidates 3 state variables into one hook
 */
export function useMatchFormUI() {
  const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);
  const leagueDropdownRef = useRef<HTMLDivElement | null>(null);
  const seasonDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close league dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (leagueDropdownRef.current && !leagueDropdownRef.current.contains(event.target as Node)) {
        setIsLeagueDropdownOpen(false);
      }
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(event.target as Node)) {
        setIsSeasonDropdownOpen(false);
      }
    };

    if (isLeagueDropdownOpen || isSeasonDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isLeagueDropdownOpen, isSeasonDropdownOpen]);

  return {
    isLeagueDropdownOpen,
    setIsLeagueDropdownOpen,
    isSeasonDropdownOpen,
    setIsSeasonDropdownOpen,
    isConfigExpanded,
    setIsConfigExpanded,
    leagueDropdownRef,
    seasonDropdownRef
  };
}

