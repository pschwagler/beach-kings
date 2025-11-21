import { useState, useEffect, useRef } from 'react';
import { User, ChevronDown } from 'lucide-react';

export default function PlayerSelector({ playerName, allPlayers, onPlayerChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const optionsRefs = useRef([]);

  // Reset search when player changes
  useEffect(() => {
    setSearchTerm('');
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
  }, [playerName]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setSearchTerm('');
        setHighlightedIndex(-1);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  const filteredPlayers = allPlayers
    ? allPlayers
        .filter(player => player.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => a.localeCompare(b))
    : [];

  const handlePlayerSelect = (player) => {
    if (onPlayerChange) {
      onPlayerChange(player);
    }
    setSearchTerm('');
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isDropdownOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIsDropdownOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const next = prev < filteredPlayers.length - 1 ? prev + 1 : 0;
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => {
          const next = prev > 0 ? prev - 1 : filteredPlayers.length - 1;
          return next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredPlayers.length) {
          handlePlayerSelect(filteredPlayers[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsDropdownOpen(false);
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

  // Reset highlighted index when filtered players change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredPlayers.length, searchTerm]);

  return (
    <div className="player-selector-container" ref={dropdownRef}>
      <User size={28} />
      <div className="player-selector-wrapper">
        <div 
          className="player-selector-current" 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="combobox"
          aria-expanded={isDropdownOpen}
          aria-haspopup="listbox"
        >
          <span className="player-selector-name">{playerName}</span>
          <ChevronDown size={20} className={isDropdownOpen ? 'rotate-180' : ''} />
        </div>
        
        {isDropdownOpen && (
          <div className="player-selector-dropdown">
            <input
              type="text"
              className="player-selector-search"
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <div className="player-selector-options">
              {!allPlayers ? (
                <div className="player-selector-option disabled">Loading players...</div>
              ) : filteredPlayers.length > 0 ? (
                filteredPlayers.map((player, index) => (
                  <div
                    key={player}
                    ref={el => optionsRefs.current[index] = el}
                    className={`player-selector-option ${player === playerName ? 'selected' : ''} ${highlightedIndex === index ? 'highlighted' : ''}`}
                    onClick={() => handlePlayerSelect(player)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    {player}
                  </div>
                ))
              ) : (
                <div className="player-selector-option disabled">
                  {searchTerm ? 'No players found' : 'No players available'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

