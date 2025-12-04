import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createPopper } from '@popperjs/core';

// Helper to check if an item is an object with value/label
const isPlayerOption = (item) => {
  return item && typeof item === 'object' && 'value' in item && 'label' in item;
};

// Helper to get display value from either string or object
const getDisplayValue = (item) => {
  if (!item) return '';
  return isPlayerOption(item) ? item.label : item;
};

// Helper to get the value (ID) from either string or object
const getValue = (item) => {
  if (!item) return '';
  return isPlayerOption(item) ? item.value : item;
};

export default function PlayerDropdown({ value, onChange, allPlayerNames, placeholder = "Select player", excludePlayers = [], autoOpen = false }) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const optionRefs = useRef([]);
  const touchStartPos = useRef(null);
  const popperInstanceRef = useRef(null);
  
  // Sync input with selected value
  useEffect(() => {
    setInputValue(getDisplayValue(value));
  }, [value]);

  // Handle auto-open prop
  useEffect(() => {
    if (autoOpen && !hasAutoOpened && !value && inputRef.current) {
      // Delay to wait for modal animation to complete
      const timeoutId = setTimeout(() => {
        inputRef.current.focus();
        setHasAutoOpened(true);
      }, 350);
      return () => clearTimeout(timeoutId);
    }
  }, [autoOpen, hasAutoOpened, value]);

  // Setup Popper.js when dropdown opens
  useEffect(() => {
    if (!isOpen || !inputRef.current || !dropdownRef.current) {
      // Cleanup popper if it exists
      if (popperInstanceRef.current) {
        popperInstanceRef.current.destroy();
        popperInstanceRef.current = null;
      }
      return;
    }

    // Calculate max height based on available space
    const calculateMaxHeight = () => {
      const rect = inputRef.current.getBoundingClientRect();
      const viewportHeight = window.visualViewport 
        ? window.visualViewport.height 
        : window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 8; // 8px padding
      return Math.max(150, Math.min(300, spaceBelow));
    };

    // Set initial max-height
    if (dropdownRef.current) {
      dropdownRef.current.style.maxHeight = `${calculateMaxHeight()}px`;
    }

    // Create Popper instance
    popperInstanceRef.current = createPopper(inputRef.current, dropdownRef.current, {
      placement: 'bottom-start',
      strategy: 'fixed',
      modifiers: [
        {
          name: 'flip',
          enabled: false, // Always show below, never flip above
        },
        {
          name: 'preventOverflow',
          enabled: false, // Disable - let it overflow and use CSS max-height instead
        },
        {
          name: 'offset',
          options: {
            offset: [0, 4], // 4px gap below input
          },
        },
        {
          name: 'computeStyles',
          options: {
            adaptive: true, // Adapt to viewport changes
            gpuAcceleration: false, // Better for mobile
          },
        },
      ],
    });

    // Update on scroll/resize
    const updatePopper = () => {
      if (popperInstanceRef.current) {
        popperInstanceRef.current.update();
        
        // Also update max-height when viewport changes
        if (dropdownRef.current && inputRef.current) {
          const rect = inputRef.current.getBoundingClientRect();
          const viewportHeight = window.visualViewport 
            ? window.visualViewport.height 
            : window.innerHeight;
          const spaceBelow = viewportHeight - rect.bottom - 8;
          const maxHeight = Math.max(150, Math.min(300, spaceBelow));
          dropdownRef.current.style.maxHeight = `${maxHeight}px`;
        }
      }
    };

    window.addEventListener('scroll', updatePopper, true);
    window.addEventListener('resize', updatePopper);
    
    // Also listen to visual viewport changes (for mobile keyboard)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updatePopper);
      window.visualViewport.addEventListener('scroll', updatePopper);
    }

    return () => {
      window.removeEventListener('scroll', updatePopper, true);
      window.removeEventListener('resize', updatePopper);
      
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updatePopper);
        window.visualViewport.removeEventListener('scroll', updatePopper);
      }
      
      if (popperInstanceRef.current) {
        popperInstanceRef.current.destroy();
        popperInstanceRef.current = null;
      }
    };
  }, [isOpen]);

  // Auto-highlight first option when dropdown opens or filtered list changes
  useEffect(() => {
    if (isOpen && filteredPlayers.length > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, inputValue]); // Re-run when input changes (affects filtered list)

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
  
  // Normalize allPlayerNames to always be an array of objects with value/label
  const normalizedPlayers = (Array.isArray(allPlayerNames) && allPlayerNames.length > 0)
    ? allPlayerNames.map(player => {
        if (isPlayerOption(player)) {
          return player;
        }
        return { value: player, label: player };
      })
    : [];
  
  // Filter players based on input and exclusions
  const filteredPlayers = normalizedPlayers.filter(player => {
    // Check if excluded
    const isExcluded = excludePlayers.some(excluded => {
      if (isPlayerOption(excluded)) {
        return excluded.value === player.value;
      }
      return excluded === player.value || excluded === player.label;
    });
    
    if (isExcluded) return false;
    
    // Filter by input value
    const label = player.label.toLowerCase();
    const searchLower = inputValue.toLowerCase();
    return label.includes(searchLower);
  });
  
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
  
  const handleTouchStart = (e) => {
    touchStartPos.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchEnd = (e, player) => {
    if (!touchStartPos.current) return;
    
    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY
    };
    
    // Calculate distance moved
    const deltaX = Math.abs(touchEnd.x - touchStartPos.current.x);
    const deltaY = Math.abs(touchEnd.y - touchStartPos.current.y);
    
    // If moved less than 10px, it's a tap, not a scroll
    if (deltaX < 10 && deltaY < 10) {
      e.preventDefault();
      handleSelectPlayer(player);
    }
    
    touchStartPos.current = null;
  };
  
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
