import { Users } from 'lucide-react';

export default function PlayersButton({ onClick }) {
  return (
    <button
      className="navbar-menu-button"
      onClick={onClick}
      aria-label="Players"
    >
      <Users size={20} />
      <span className="navbar-menu-label">Players</span>
    </button>
  );
}

