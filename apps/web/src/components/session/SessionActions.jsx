import { Plus, Check, X } from 'lucide-react';
import { Button } from '../ui/UI';

export default function SessionActions({
  onAddMatchClick,
  onSubmitClick,
  onSaveClick,
  onCancelClick,
  isEditing = false,
}) {
  const showAdd = Boolean(onAddMatchClick);
  const showSubmit = Boolean(onSubmitClick) && !isEditing;
  const showEditActions = isEditing && (onSaveClick != null || onCancelClick != null);
  if (!showAdd && !showSubmit && !showEditActions) {
    return null;
  }
  return (
    <div className="session-actions" data-testid="session-actions">
      {showAdd && (
        <Button variant="outline" onClick={onAddMatchClick} data-testid="session-btn-add" className="session-btn">
          <Plus size={16} />
          Add New Match
        </Button>
      )}
      {showEditActions ? (
        <>
          {onCancelClick && (
            <Button variant="ghost" onClick={onCancelClick} data-testid="session-btn-cancel" className="session-btn">
              <X size={16} />
              Cancel
            </Button>
          )}
          {onSaveClick && (
            <Button variant="success" onClick={onSaveClick} data-testid="session-btn-save" className="session-btn">
              <Check size={16} />
              Save Changes
            </Button>
          )}
        </>
      ) : showSubmit ? (
        <Button variant="success" onClick={onSubmitClick} data-testid="session-btn-submit" className="session-btn">
          <Check size={16} />
          Submit
        </Button>
      ) : null}
    </div>
  );
}
