import { Plus } from 'lucide-react';
import VolleyballIcon from './VolleyballIcon';

export default function RecordGamesButton({ onClick }) {
  return (
    <button
      className="navbar-menu-button"
      onClick={onClick}
      aria-label="Add Games"
    >
      <div className="navbar-icon-with-plus">
        <VolleyballIcon className="navbar-volleyball-icon" />
        <Plus size={12} className="navbar-plus-overlay" />
      </div>
      <span className="navbar-menu-label">Add Games</span>
    </button>
  );
}

