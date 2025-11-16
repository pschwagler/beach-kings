import { useState, useEffect } from 'react';
import { User, ChevronDown } from 'lucide-react';

export default function PlayerSelector({ playerName, allPlayers, onPlayerChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Reset search when player changes
  useEffect(() => {
    setSearchTerm('');
    setIsDropdownOpen(false);
  }, [playerName]);

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
  };

  return (
    <div className="player-selector-container">
      <User size={28} />
      <div className="player-selector-wrapper">
        <div className="player-selector-current" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
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
              autoFocus
            />
            <div className="player-selector-options">
              {!allPlayers ? (
                <div className="player-selector-option disabled">Loading players...</div>
              ) : filteredPlayers.length > 0 ? (
                filteredPlayers.map((player) => (
                  <div
                    key={player}
                    className={`player-selector-option ${player === playerName ? 'selected' : ''}`}
                    onClick={() => handlePlayerSelect(player)}
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

