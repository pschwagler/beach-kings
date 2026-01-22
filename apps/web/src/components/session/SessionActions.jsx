import { Plus, Save, X, Camera } from 'lucide-react';

export default function SessionActions({ 
  onAddMatchClick, 
  onUploadPhotoClick,
  onSubmitClick, 
  onSaveClick, 
  onCancelClick, 
  isEditing = false 
}) {
  return (
    <div className="session-actions" data-testid="session-actions">
      <button className="session-btn session-btn-add" onClick={onAddMatchClick} data-testid="session-btn-add">
        <Plus size={22} />
        Add New Match
      </button>
      {onUploadPhotoClick && (
        <button 
          className="session-btn session-btn-upload" 
          onClick={onUploadPhotoClick} 
          data-testid="session-btn-upload"
          title="Upload photo of scores"
        >
          <Camera size={20} />
          Upload Photo
        </button>
      )}
      {isEditing ? (
        <>
          <button 
            className="session-btn session-btn-cancel" 
            onClick={onCancelClick}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
            data-testid="session-btn-cancel"
          >
            <X size={20} />
            Cancel
          </button>
          <button className="session-btn session-btn-submit" onClick={onSaveClick} data-testid="session-btn-save">
            <Save size={20} />
            Save Changes
          </button>
        </>
      ) : (
        <button className="session-btn session-btn-submit" onClick={onSubmitClick} data-testid="session-btn-submit">
          <Save size={20} />
          Submit
        </button>
      )}
    </div>
  );
}
