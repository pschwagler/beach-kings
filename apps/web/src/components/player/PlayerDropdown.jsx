'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownPopper } from '../../hooks/useDropdownPopper';
import { useTouchSelection } from '../../hooks/useTouchSelection';
import {
  getDisplayValue,
  getValue,
  normalizePlayerNames,
  filterPlayers,
} from '../../utils/playerDropdownUtils';
import PlaceholderBadge from './PlaceholderBadge';

/**
 * Searchable player dropdown with inline placeholder creation.
 *
 * @param {Object} props
 * @param {Object|string} props.value - Selected player (object or string)
 * @param {function} props.onChange - Called with selected player option
 * @param {Array} props.allPlayerNames - Player options (strings or {value, label, isPlaceholder?})
 * @param {string} [props.placeholder] - Input placeholder text
 * @param {Array} [props.excludePlayers] - Players to exclude
 * @param {boolean} [props.autoOpen] - Auto-focus on mount
 * @param {function} [props.onCreatePlaceholder] - Async callback (name) => playerOption. Enables inline creation.
 */
export default function PlayerDropdown({
  value,
  onChange,
  allPlayerNames,
  placeholder = "Select player",
  excludePlayers = [],
  autoOpen = false,
  onCreatePlaceholder = null,
}) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isCreating, setIsCreating] = useState(false);

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

  // Normalize and filter players
  const normalizedPlayers = normalizePlayerNames(allPlayerNames);
  const filteredPlayers = filterPlayers(normalizedPlayers, excludePlayers, inputValue);

  // Determine if the "Add [name]" option should be shown
  const trimmedInput = inputValue.trim();
  const showCreateOption = onCreatePlaceholder && trimmedInput.length >= 2 && filteredPlayers.length === 0;

  // Total selectable items (filtered players + optional create option)
  const totalItems = filteredPlayers.length + (showCreateOption ? 1 : 0);

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
    // Select all text if there's a value
    if (inputValue && inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleInputClick = () => {
    // Select all text when clicking if there's a value
    if (inputValue && inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen || totalItems === 0) {
      // Open dropdown on ArrowDown when closed
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
        } else if (highlightedIndex === filteredPlayers.length && showCreateOption) {
          handleCreatePlaceholder();
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
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
   * Handle "Add [name]" click — create placeholder via callback.
   */
  const handleCreatePlaceholder = async () => {
    if (!onCreatePlaceholder || !trimmedInput || isCreating) return;
    setIsCreating(true);
    try {
      const newPlayer = await onCreatePlaceholder(trimmedInput);
      if (newPlayer) {
        handleSelectPlayer(newPlayer);
      }
    } catch (err) {
      console.error('Failed to create placeholder player:', err);
    } finally {
      setIsCreating(false);
    }
  };

  // Use touch selection hook
  const { handleTouchStart, handleTouchEnd } = useTouchSelection(handleSelectPlayer);

  const createOptionIndex = filteredPlayers.length;

  const dropdownContent = isOpen && (
    <ul
      ref={dropdownRef}
      className="player-dropdown-list"
      style={{
        zIndex: 9999,
        overflow: 'auto',
      }}
    >
      {filteredPlayers.length > 0 ? (
        filteredPlayers.map((player, index) => (
          <li
            key={getValue(player)}
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
      ) : !showCreateOption && inputValue ? (
        <li className="player-dropdown-option disabled">
          No players found
        </li>
      ) : null}

      {showCreateOption && (
        <li
          ref={el => optionRefs.current[createOptionIndex] = el}
          className={`player-dropdown-option create-placeholder ${highlightedIndex === createOptionIndex ? 'highlighted' : ''} ${isCreating ? 'creating' : ''}`}
          onClick={handleCreatePlaceholder}
          onMouseEnter={() => setHighlightedIndex(createOptionIndex)}
          data-testid="create-placeholder-option"
        >
          <span className="create-placeholder__icon">+</span>
          {isCreating ? `Creating "${trimmedInput}"...` : `Add "${trimmedInput}"`}
        </li>
      )}
    </ul>
  );

  return (
    <div className="player-dropdown-container" ref={containerRef} data-testid="player-dropdown-container">
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onClick={handleInputClick}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        className="player-dropdown-input"
      />
      {typeof window !== 'undefined' && dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}
