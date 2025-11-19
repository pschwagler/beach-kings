import { useState, useEffect } from 'react';
import { Edit2 } from 'lucide-react';
import { updateLeague } from '../../services/api';

export default function DescriptionSection({ league, leagueId, isAdmin, onUpdate, showMessage }) {
  const [description, setDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (league) {
      setDescription(league.description || '');
    }
  }, [league]);

  const handleEdit = () => {
    setIsEditing(true);
    setDescription(league?.description || '');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDescription(league?.description || '');
  };

  const handleSave = async () => {
    try {
      const updatedLeague = await updateLeague(leagueId, {
        name: league?.name || '',
        description: description.trim() || null,
        level: league?.level || null,
        location_id: league?.location_id || null,
        is_open: league?.is_open ?? true,
        gender: league?.gender || null,
        whatsapp_group_id: league?.whatsapp_group_id || null
      });

      onUpdate(updatedLeague);
      setIsEditing(false);
      showMessage?.('success', 'Description updated successfully');
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update description');
    }
  };

  return (
    <div className="league-description-section">
      {isEditing ? (
        <div className="league-description-edit">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="league-description-input"
            rows={4}
            placeholder="League description"
          />
          <div className="league-description-actions">
            <button className="league-text-button" onClick={handleCancel}>
              Cancel
            </button>
            <button className="league-text-button primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="league-description-display">
          <p className="league-description-text">
            {league?.description || 'No description'}
          </p>
          {isAdmin && (
            <button
              className="league-edit-icon"
              onClick={handleEdit}
              title="Edit description"
            >
              <Edit2 size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}


