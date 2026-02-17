import { LEVEL_OPTIONS } from './utils/leagueUtils';
import { updateLeague } from '../../services/api';
import { useLeague } from '../../contexts/LeagueContext';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';

export default function LeagueInfoSection({ league, onUpdate }) {
  const { isLeagueAdmin, leagueId } = useLeague();
  const { locations } = useApp();
  const { showToast } = useToast();

  const handleLevelChange = async (e) => {
    const newLevel = e.target.value || null;
    try {
      const updatedLeague = await updateLeague(leagueId, {
        name: league?.name || '',
        description: league?.description || null,
        level: newLevel,
        location_id: league?.location_id || null,
        is_open: league?.is_open ?? true,
        gender: league?.gender || null,
        whatsapp_group_id: league?.whatsapp_group_id || null
      });
      onUpdate?.(updatedLeague);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update skill level', 'error');
      // Reset to original value on error
      e.target.value = league?.level || '';
    }
  };

  const handleLocationChange = async (e) => {
    const newLocationId = e.target.value || null;
    try {
      const updatedLeague = await updateLeague(leagueId, {
        name: league?.name || '',
        description: league?.description || null,
        level: league?.level || null,
        location_id: newLocationId,
        is_open: league?.is_open ?? true,
        gender: league?.gender || null,
        whatsapp_group_id: league?.whatsapp_group_id || null
      });
      onUpdate?.(updatedLeague);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update location', 'error');
      // Reset to original value on error
      e.target.value = league?.location_id ? String(league.location_id) : '';
    }
  };

  const handleAccessChange = async (e) => {
    const isOpen = e.target.value === 'open';
    try {
      const updatedLeague = await updateLeague(leagueId, {
        name: league?.name || '',
        description: league?.description || null,
        level: league?.level || null,
        location_id: league?.location_id || null,
        is_open: isOpen,
        gender: league?.gender || null,
        whatsapp_group_id: league?.whatsapp_group_id || null
      });
      onUpdate?.(updatedLeague);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update access', 'error');
      // Reset to original value on error
      e.target.value = league?.is_open ? 'open' : 'invite-only';
    }
  };

  return (
    <div className="league-info-section">
      <h3 className="league-section-title">League Information</h3>
      <div className="league-info-list">
        <div className="league-info-item">
          <span className="league-info-label">Access:</span>
          {isLeagueAdmin ? (
            <select
              value={league?.is_open ? 'open' : 'invite-only'}
              onChange={handleAccessChange}
              className="league-info-select"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="open">Open</option>
              <option value="invite-only">Invite Only</option>
            </select>
          ) : (
            <span className="league-info-value">{league?.is_open ? 'Open' : 'Invite Only'}</span>
          )}
        </div>
        <div className="league-info-item">
          <span className="league-info-label">Skill Level:</span>
          {isLeagueAdmin ? (
            <select
              value={league?.level || ''}
              onChange={handleLevelChange}
              className="league-info-select"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">None</option>
              {LEVEL_OPTIONS.filter(opt => opt.value && opt.value !== '').map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <span className="league-info-value">
              {league?.level ? (LEVEL_OPTIONS.find(opt => opt.value === league.level)?.label || league.level) : 'Not set'}
            </span>
          )}
        </div>
        <div className="league-info-item">
          <span className="league-info-label">Location:</span>
          {isLeagueAdmin ? (
            <select
              value={league?.location_id ? String(league.location_id) : ''}
              onChange={handleLocationChange}
              className="league-info-select"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">None</option>
              {locations.map(loc => (
                <option key={loc.id} value={String(loc.id)}>{loc.name}</option>
              ))}
            </select>
          ) : (
            <span className="league-info-value">
              {league?.location_id ? (locations.find(loc => loc.id === league.location_id)?.name || `Location ${league.location_id}`) : 'Not set'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
