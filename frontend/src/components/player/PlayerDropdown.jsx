import { useState, useRef, useEffect } from 'react';
import { ChevronDown, UserPlus } from 'lucide-react';

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

  const filteredPlayers = allPlayerNames
    ? allPlayerNames.filter(player => 
        player.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !excludePlayers.includes(player)
      )
    : [];

  const showCreateOption = searchTerm.trim() && 
    !allPlayerNames.some(name => name.toLowerCase() === searchTerm.toLowerCase());

  // Build the full options list (create option + filtered players)
  const totalOptions = (showCreateOption ? 1 : 0) + filteredPlayers.length;

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
    onChange(player);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
    // Return focus to trigger for continued tab navigation
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 0);
  };

  const handleCreateNew = () => {
    const newName = searchTerm.trim();
    if (newName) {
      // Just set the name - don't create in DB yet
      // The parent component will handle creating the player when the form is submitted
      onChange(newName);
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(-1);
      // Return focus to trigger for continued tab navigation
      setTimeout(() => {
        triggerRef.current?.focus();
      }, 0);
    }
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
        if (showCreateOption && highlightedIndex === filteredPlayers.length) {
          // Create new player option is highlighted
          handleCreateNew();
        } else if (highlightedIndex >= 0 && highlightedIndex < filteredPlayers.length) {
          // A filtered player is highlighted
          handleSelect(filteredPlayers[highlightedIndex]);
        }
        break;
      
      case 'Tab':
        // Select first option on Tab if options exist and user has typed something
        // Prioritize existing players over creating new
        // Don't prevent default so Tab can still move to next field
        if (totalOptions > 0 && searchTerm.trim()) {
          if (filteredPlayers.length > 0) {
            handleSelect(filteredPlayers[0]);
          } else if (showCreateOption) {
            handleCreateNew();
          }
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
          {value || placeholder}
        </span>
        <ChevronDown size={18} className={isOpen ? 'rotate-180' : ''} />
      </div>

      {isOpen && (
        <div className="player-dropdown-menu">
          <input
            ref={searchInputRef}
            type="text"
            className="player-dropdown-search"
            placeholder="Search or type new name..."
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
                  key={player}
                  ref={el => optionsRefs.current[index] = el}
                  className={`player-dropdown-option ${player === value ? 'selected' : ''} ${highlightedIndex === index ? 'highlighted' : ''}`}
                  onClick={() => handleSelect(player)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {player}
                </div>
              ))
            ) : !showCreateOption ? (
              <div className="player-dropdown-option disabled">
                {searchTerm ? 'No players found' : 'No players available'}
              </div>
            ) : null}
            
            {showCreateOption && (
              <div 
                ref={el => optionsRefs.current[filteredPlayers.length] = el}
                className={`player-dropdown-option create-new ${highlightedIndex === filteredPlayers.length ? 'highlighted' : ''}`}
                onClick={handleCreateNew}
                onMouseEnter={() => setHighlightedIndex(filteredPlayers.length)}
              >
                <UserPlus size={16} />
                <span>Create "{searchTerm}"</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

