'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownPopper } from '../../hooks/useDropdownPopper';
import { useTouchSelection } from '../../hooks/useTouchSelection';
import {
  getDisplayValue,
  getValue,
  normalizePlayerNames,
  filterPlayers,
  hasExactMatch,
} from '../../utils/playerDropdownUtils';
import PlaceholderBadge from './PlaceholderBadge';
import PlaceholderCreateModal from './PlaceholderCreateModal';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Searchable player dropdown with inline placeholder creation and duplicate checking.
 *
 * @param {Object} props
 * @param {Object|string} props.value - Selected player (object or string)
 * @param {function} props.onChange - Called with selected player option
 * @param {Array} props.allPlayerNames - Player options (strings or {value, label, isPlaceholder?})
 * @param {string} [props.placeholder] - Input placeholder text
 * @param {Array} [props.excludePlayers] - Players to exclude
 * @param {boolean} [props.autoOpen] - Auto-focus on mount
 * @param {function} [props.onCreatePlaceholder] - Async callback (name) => playerOption. Enables inline creation.
 * @param {function} [props.onSearchPlayers] - Async callback (query) => { items: [...] }. Searches registered players.
 * @param {Set<number>} [props.leagueMemberIds] - Set of player IDs currently in the league
 */
export default function PlayerDropdown({
  value,
  onChange,
  allPlayerNames,
  placeholder = "Select player",
  excludePlayers = [],
  autoOpen = false,
  onCreatePlaceholder = null,
  onSearchPlayers = null,
  leagueMemberIds = null,
  leagueGender = null,
  leagueLevel = null,
}) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [createFormName, setCreateFormName] = useState('');
  const [createModalState, setCreateModalState] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const createInputRef = useRef(null);
  const searchDebounceRef = useRef(null);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const optionRefs = useRef([]);

  // Use custom hooks
  useDropdownPopper(isOpen, inputRef, dropdownRef);

  // Sync input with selected value
  useEffect(() => {
    setInputValue(getDisplayValue(value));
  }, [value]);

  // Handle auto-open prop
  useEffect(() => {
    if (autoOpen && !hasAutoOpened && !value && inputRef.current) {
      const timeoutId = setTimeout(() => {
        inputRef.current.focus();
        setHasAutoOpened(true);
      }, 350);
      return () => clearTimeout(timeoutId);
    }
  }, [autoOpen, hasAutoOpened, value]);

  // Debounced search when createFormName changes in create mode
  useEffect(() => {
    if (!isCreateMode || !onSearchPlayers) {
      setSearchResults([]);
      return;
    }

    const trimmed = createFormName.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const result = await onSearchPlayers(trimmed);
        setSearchResults(result?.items || []);
      } catch (err) {
        console.error('Player search failed:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [createFormName, isCreateMode, onSearchPlayers]);

  // Normalize and filter players
  const normalizedPlayers = normalizePlayerNames(allPlayerNames);
  const filteredPlayers = filterPlayers(normalizedPlayers, excludePlayers, inputValue);

  // Whether to show the "+ Add Unregistered Player" option at bottom
  const showAddUnregistered = !!onCreatePlaceholder && !isCreateMode;

  // Total selectable items (filtered players + optional add-unregistered option)
  const totalItems = filteredPlayers.length + (showAddUnregistered ? 1 : 0);

  // Index of the add-unregistered option
  const addUnregisteredIndex = filteredPlayers.length;

  // Auto-highlight first option when dropdown opens or filtered list changes
  useEffect(() => {
    if (isOpen && totalItems > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, inputValue, totalItems]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionRefs.current[highlightedIndex]) {
      optionRefs.current[highlightedIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [highlightedIndex]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      const clickedContainer = containerRef.current && containerRef.current.contains(e.target);
      const clickedDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);

      if (!clickedContainer && !clickedDropdown) {
        setIsOpen(false);
        setIsCreateMode(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    if (inputValue && inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleInputClick = () => {
    if (inputValue && inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen || totalItems === 0) {
      if (e.key === 'ArrowDown' && !isOpen) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < totalItems - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : totalItems - 1
        );
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredPlayers.length) {
          handleSelectPlayer(filteredPlayers[highlightedIndex]);
        } else if (showAddUnregistered && highlightedIndex === addUnregisteredIndex) {
          enterCreateMode();
        }
        break;

      case 'Escape':
        e.preventDefault();
        if (isCreateMode) {
          setIsCreateMode(false);
        } else {
          setIsOpen(false);
        }
        break;

      default:
        break;
    }
  };

  const handleSelectPlayer = (player) => {
    onChange(player);
    setInputValue(getDisplayValue(player));
    setIsOpen(false);
  };

  /**
   * Enter inline create mode — shows name input + duplicate search.
   */
  const enterCreateMode = () => {
    setIsCreateMode(true);
    setCreateFormName(inputValue.trim());
    setSearchResults([]);
    setTimeout(() => createInputRef.current?.focus(), 50);
  };

  /**
   * Open the create modal for the given name, closing the dropdown create mode.
   * @param {string} [nameOverride] - Optional name to use instead of createFormName
   */
  const openCreateModal = (nameOverride) => {
    const name = nameOverride || createFormName.trim();
    if (!onCreatePlaceholder || !name) return;
    setCreateModalState({ name });
    setIsCreateMode(false);
    setIsOpen(false);
  };

  /**
   * Handle modal close — select the created player if one was returned.
   * @param {Object|null} result - Created player data or null if cancelled
   */
  const handleModalClose = (result) => {
    setCreateModalState(null);
    if (result) {
      handleSelectPlayer(result);
    }
  };

  /**
   * Handle clicking a search result that is a league member — auto-select them.
   */
  const handleSelectSearchResult = useCallback((result) => {
    const playerOption = {
      value: result.id,
      label: result.full_name,
    };
    setIsCreateMode(false);
    handleSelectPlayer(playerOption);
  }, []);

  // Use touch selection hook
  const { handleTouchStart, handleTouchEnd } = useTouchSelection(handleSelectPlayer);

  /**
   * Render the create mode UI inside the dropdown: name input, search results, create button.
   */
  const renderCreateMode = () => {
    const trimmedName = createFormName.trim();
    const hasResults = searchResults.length > 0;
    const isDuplicate = hasExactMatch(normalizedPlayers, trimmedName);

    return (
      <li className="player-dropdown-create-form" role="option" aria-selected={false}>
        <input
          ref={createInputRef}
          type="text"
          value={createFormName}
          onChange={(e) => setCreateFormName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (trimmedName.length >= 2) {
                openCreateModal(trimmedName);
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setIsCreateMode(false);
            }
          }}
          placeholder="Player name"
          className="player-dropdown-create-input"
          autoComplete="off"
        />

        {isDuplicate && (
          <div className="player-dropdown-duplicate-warning" role="alert">
            A player named &quot;{trimmedName}&quot; already exists in this league.
          </div>
        )}

        {isSearching && (
          <div className="player-dropdown-search-results">
            <span className="player-dropdown-search-label">Searching...</span>
          </div>
        )}

        {!isSearching && hasResults && (
          <div className="player-dropdown-search-results">
            <span className="player-dropdown-search-label">Is this who you&apos;re looking for?</span>
            {searchResults.map((result) => {
              const isMember = leagueMemberIds && leagueMemberIds.has(result.id);
              return (
                <div
                  key={result.id}
                  className={`player-dropdown-search-result ${isMember ? 'clickable' : ''}`}
                  onClick={isMember ? () => handleSelectSearchResult(result) : undefined}
                  role={isMember ? 'button' : undefined}
                  tabIndex={isMember ? 0 : undefined}
                >
                  <span className="player-dropdown-search-result__name">{result.full_name}</span>
                  <span className="player-dropdown-search-result__meta">
                    {[
                      result.location_name,
                      result.gender,
                      result.level,
                      result.total_games != null ? `${result.total_games} games` : null,
                      result.current_rating != null ? `${Math.round(result.current_rating)} rating` : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                  {!isMember && (
                    <span className="player-dropdown-search-result__hint">Add them from the Members tab</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {trimmedName.length >= 2 && (
          <button
            type="button"
            className="player-dropdown-create-confirm-btn"
            onClick={() => openCreateModal(trimmedName)}
            disabled={isCreating}
          >
            {isCreating
              ? 'Creating...'
              : isDuplicate
                ? `Create another "${trimmedName}" anyway`
                : hasResults
                  ? `None of these — create "${trimmedName}" as unregistered`
                  : `Create "${trimmedName}" as unregistered player`
            }
          </button>
        )}
      </li>
    );
  };

  const dropdownContent = isOpen && (
    <ul
      ref={dropdownRef}
      id="player-dropdown-listbox"
      role="listbox"
      className="player-dropdown-list"
      style={{
        zIndex: 9999,
        overflow: 'auto',
      }}
    >
      {isCreateMode ? (
        renderCreateMode()
      ) : (
        <>
          {filteredPlayers.length > 0 ? (
            filteredPlayers.map((player, index) => (
              <li
                key={getValue(player)}
                id={`player-option-${index}`}
                role="option"
                aria-selected={highlightedIndex === index}
                ref={el => optionRefs.current[index] = el}
                className={`player-dropdown-option ${highlightedIndex === index ? 'highlighted' : ''}`}
                onClick={() => handleSelectPlayer(player)}
                onTouchStart={handleTouchStart}
                onTouchEnd={(e) => handleTouchEnd(e, player)}
                onMouseEnter={() => setHighlightedIndex(index)}
                data-testid="player-dropdown-option"
              >
                {getDisplayValue(player)}
                {player.isPlaceholder && <PlaceholderBadge />}
              </li>
            ))
          ) : inputValue ? (
            <li className="player-dropdown-option disabled">
              No players found
            </li>
          ) : null}

          {showAddUnregistered && (
            <li
              id={`player-option-${addUnregisteredIndex}`}
              role="option"
              aria-selected={highlightedIndex === addUnregisteredIndex}
              ref={el => optionRefs.current[addUnregisteredIndex] = el}
              className={`player-dropdown-option create-placeholder add-unregistered ${highlightedIndex === addUnregisteredIndex ? 'highlighted' : ''}`}
              onClick={enterCreateMode}
              onMouseEnter={() => setHighlightedIndex(addUnregisteredIndex)}
              data-testid="add-unregistered-player-option"
            >
              <span className="create-placeholder__icon">+</span>
              Add Unregistered Player
            </li>
          )}
        </>
      )}
    </ul>
  );

  const effectivePlaceholder = onCreatePlaceholder && placeholder === 'Select player'
    ? 'Search or add player'
    : placeholder;

  return (
    <div className="player-dropdown-container" ref={containerRef} data-testid="player-dropdown-container">
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls="player-dropdown-listbox"
        aria-activedescendant={highlightedIndex >= 0 ? `player-option-${highlightedIndex}` : undefined}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onClick={handleInputClick}
        onKeyDown={handleKeyDown}
        placeholder={effectivePlaceholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        className="player-dropdown-input"
      />
      {typeof window !== 'undefined' && dropdownContent && createPortal(dropdownContent, document.body)}
      <PlaceholderCreateModal
        isOpen={!!createModalState}
        playerName={createModalState?.name || ''}
        onCreate={onCreatePlaceholder}
        onClose={handleModalClose}
        leagueGender={leagueGender}
        leagueLevel={leagueLevel}
      />
    </div>
  );
}
