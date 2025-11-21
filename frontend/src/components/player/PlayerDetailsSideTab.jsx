import { User } from 'lucide-react';

export default function PlayerDetailsSideTab({ onClick, isVisible }) {
  if (!isVisible) return null;

  return (
    <button
      className="player-details-side-tab"
      onClick={onClick}
      aria-label="Open player details"
    >
      <User size={20} />
    </button>
  );
}

