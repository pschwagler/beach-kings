import { Plus, Save } from 'lucide-react';

export default function SessionActions({ onAddMatchClick, onSubmitClick }) {
  return (
    <div className="session-actions">
      <button className="session-btn session-btn-add" onClick={onAddMatchClick}>
        <Plus size={22} />
        Add New Match
      </button>
      <button className="session-btn session-btn-submit" onClick={onSubmitClick}>
        <Save size={20} />
        Submit
      </button>
    </div>
  );
}



