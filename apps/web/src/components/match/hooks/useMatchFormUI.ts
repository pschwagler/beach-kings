import { useState, useEffect, useRef } from 'react';

/**
 * Hook to manage UI state for match form (dropdowns, expanded state)
 * Consolidates 3 state variables into one hook
 */
export function useMatchFormUI() {
  const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(true);
  const leagueDropdownRef = useRef(null);
  const seasonDropdownRef = useRef(null);

  // Close league dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (leagueDropdownRef.current && !leagueDropdownRef.current.contains(event.target)) {
        setIsLeagueDropdownOpen(false);
      }
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(event.target)) {
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

