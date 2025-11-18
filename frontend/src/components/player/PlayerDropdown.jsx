import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

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

// Helper to check if two items are equal
const itemsEqual = (a, b) => {
  if (!a || !b) return a === b;
  if (isPlayerOption(a) && isPlayerOption(b)) {
    return a.value === b.value;
  }
  return a === b;
};

export default function PlayerDropdown({ value, onChange, allPlayerNames, placeholder = "Select player", excludePlayers = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const optionsRefs = useRef([]);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Normalize allPlayerNames to always be an array of objects with value/label
  const normalizedPlayers = (Array.isArray(allPlayerNames) && allPlayerNames.length > 0)
    ? allPlayerNames.map(player => {
        if (isPlayerOption(player)) {
          return player;
        }
        // Convert string to object format
        return { value: player, label: player };
      })
    : [];

  const filteredPlayers = normalizedPlayers.filter(player => {
    const label = player.label.toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = label.includes(searchLower);
    
    // Check if excluded (compare by value for objects, by string for legacy)
    const isExcluded = excludePlayers.some(excluded => {
      if (isPlayerOption(excluded)) {
        return excluded.value === player.value;
      }
      return excluded === player.value || excluded === player.label;
    });
    
    return matchesSearch && !isExcluded;
  });

  // Total options is just the filtered players
  const totalOptions = filteredPlayers.length;

  // Auto-highlight first option when search term changes or dropdown opens
  useEffect(() => {
    if (isOpen && totalOptions > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [searchTerm, isOpen, totalOptions]);

  // Focus search input when dropdown opens, clear search when it closes
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    } else if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  const handleSelect = (player) => {
    // Always pass the full object (or string for backward compatibility)
    onChange(player);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
    // Return focus to trigger for continued tab navigation
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen || totalOptions === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < totalOptions - 1 ? prev + 1 : 0
        );
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : totalOptions - 1
        );
        break;
      
      case 'Enter':
        e.preventDefault();
        
        if (totalOptions === 0) return;
        
        // Select the highlighted option (first option is auto-highlighted)
        if (highlightedIndex >= 0 && highlightedIndex < filteredPlayers.length) {
          handleSelect(filteredPlayers[highlightedIndex]);
        }
        break;
      
      case 'Tab':
        // Select first option on Tab if options exist and user has typed something
        // Don't prevent default so Tab can still move to next field
        if (totalOptions > 0 && searchTerm.trim() && filteredPlayers.length > 0) {
            handleSelect(filteredPlayers[0]);
        }
        break;
      
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
        break;
      
      default:
        break;
    }
  };

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && optionsRefs.current[highlightedIndex]) {
      optionsRefs.current[highlightedIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [highlightedIndex]);

  const handleTriggerKeyDown = (e) => {
    // Open dropdown on Enter or Space
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
      return;
    }

    // Open dropdown and navigate on arrow keys
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      return;
    }

    // Open dropdown and start typing on alphanumeric keys
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      // Open dropdown and set the initial search character
      if (!isOpen) {
        setIsOpen(true);
        setSearchTerm(e.key);
      }
    }
  };

  return (
    <div className="player-dropdown-container" ref={dropdownRef}>
      <div 
        ref={triggerRef}
        className={`player-dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        tabIndex={0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={value ? 'player-dropdown-value' : 'player-dropdown-placeholder'}>
          {value ? getDisplayValue(value) : placeholder}
        </span>
        <ChevronDown size={18} className={isOpen ? 'rotate-180' : ''} />
      </div>

      {isOpen && (
        <div className="player-dropdown-menu">
          <input
            ref={searchInputRef}
            type="text"
            className="player-dropdown-search"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          
          <div className="player-dropdown-options">
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map((player, index) => (
                <div
                  key={isPlayerOption(player) ? player.value : player}
                  ref={el => optionsRefs.current[index] = el}
                  className={`player-dropdown-option ${itemsEqual(player, value) ? 'selected' : ''} ${highlightedIndex === index ? 'highlighted' : ''}`}
                  onClick={() => handleSelect(player)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {player.label}
                </div>
              ))
            ) : (
              <div className="player-dropdown-option disabled">
                {searchTerm ? 'No players found' : 'No players available'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

