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

export default function PlayerDropdown({ 
  value, 
  onChange, 
  allPlayerNames, 
  placeholder = "Select player", 
  excludePlayers = [], 
  autoOpen = false 
}) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  
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

  // Auto-highlight first option when dropdown opens or filtered list changes
  useEffect(() => {
    if (isOpen && filteredPlayers.length > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, inputValue, filteredPlayers.length]);

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
    if (!isOpen || filteredPlayers.length === 0) {
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
          prev < filteredPlayers.length - 1 ? prev + 1 : 0
        );
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : filteredPlayers.length - 1
        );
        break;
      
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredPlayers.length) {
          handleSelectPlayer(filteredPlayers[highlightedIndex]);
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

  // Use touch selection hook
  const { handleTouchStart, handleTouchEnd } = useTouchSelection(handleSelectPlayer);
  
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
          >
            {getDisplayValue(player)}
          </li>
        ))
      ) : inputValue ? (
        <li className="player-dropdown-option disabled">
          No players found
        </li>
      ) : null}
    </ul>
  );

  return (
    <div className="player-dropdown-container" ref={containerRef}>
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
      {dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  );
}
