import { Users } from 'lucide-react';

interface PlayersButtonProps {
  onClick?: () => void;
}

export default function PlayersButton({ onClick }: PlayersButtonProps) {
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
