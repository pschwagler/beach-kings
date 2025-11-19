import { Calendar, Plus } from 'lucide-react';
import { formatDateRange } from './utils/leagueUtils';

export default function SeasonsSection({ seasons, isAdmin, onCreateSeason }) {
  return (
    <div className="league-seasons-section">
      <div className="league-section-header">
        <h3 className="league-section-title">
          <Calendar size={18} />
          Seasons
        </h3>
        {isAdmin && (
          <button className="league-text-button" onClick={onCreateSeason}>
            <Plus size={16} />
            New Season
          </button>
        )}
      </div>

      {seasons.length === 0 ? (
        <div className="league-empty-state">
          <Calendar size={40} />
          <p>No seasons yet</p>
        </div>
      ) : (
        <div className="league-seasons-grid">
          {seasons.map((season) => (
            <div key={season.id} className="league-season-item">
              <div className="league-season-content">
                <h4 className="league-season-name">
                  {season.name || `Season ${season.id}`}
                </h4>
                <p className="league-season-dates">
                  {formatDateRange(season.start_date, season.end_date)}
                </p>
              </div>
              {season.is_active && (
                <span className="league-season-active">Active</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


