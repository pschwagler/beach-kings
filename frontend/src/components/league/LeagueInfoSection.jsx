import { LEVEL_OPTIONS } from './utils/leagueUtils';

export default function LeagueInfoSection({ league, locations }) {
  return (
    <div className="league-info-section">
      <h3 className="league-section-title">League Information</h3>
      <div className="league-info-list">
        <div className="league-info-item">
          <span className="league-info-label">Access:</span>
          <span className="league-info-value">{league.is_open ? 'Open' : 'Invite Only'}</span>
        </div>
        {league.level && (
          <div className="league-info-item">
            <span className="league-info-label">Skill Level:</span>
            <span className="league-info-value">
              {LEVEL_OPTIONS.find(opt => opt.value === league.level)?.label || league.level}
            </span>
          </div>
        )}
        {league.location_id && (
          <div className="league-info-item">
            <span className="league-info-label">Location:</span>
            <span className="league-info-value">
              {locations.find(loc => loc.id === league.location_id)?.name || `Location ${league.location_id}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

