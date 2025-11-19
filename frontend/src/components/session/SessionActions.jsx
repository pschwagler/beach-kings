import { Plus, Save, X } from 'lucide-react';

export default function SessionActions({ onAddMatchClick, onSubmitClick, onSaveClick, onCancelClick, isEditing = false }) {
  return (
    <div className="session-actions">
      <button className="session-btn session-btn-add" onClick={onAddMatchClick}>
        <Plus size={22} />
        Add New Match
      </button>
      {isEditing ? (
        <>
          <button 
            className="session-btn session-btn-cancel" 
            onClick={onCancelClick}
            style={{ backgroundColor: '#ef4444', color: 'white' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
          >
            <X size={20} />
            Cancel
          </button>
          <button className="session-btn session-btn-submit" onClick={onSaveClick}>
            <Save size={20} />
            Save Changes
          </button>
        </>
      ) : (
        <button className="session-btn session-btn-submit" onClick={onSubmitClick}>
          <Save size={20} />
          Submit
        </button>
      )}
    </div>
  );
}



