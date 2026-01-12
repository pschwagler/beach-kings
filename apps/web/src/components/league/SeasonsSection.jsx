import { Calendar, Plus, Edit2 } from 'lucide-react';
import { formatDateRange } from './utils/leagueUtils';
import { useLeague } from '../../contexts/LeagueContext';
import { useState } from 'react';
import EditSeasonModal from './EditSeasonModal';

export default function SeasonsSection({ seasons, onCreateSeason }) {
  const { isLeagueAdmin, isSeasonActive, isSeasonPast, refreshSeasons } = useLeague();
  const [editingSeason, setEditingSeason] = useState(null);

  const handleEditSeason = (season) => {
    setEditingSeason(season);
  };

  const handleEditSuccess = async () => {
    await refreshSeasons();
    setEditingSeason(null);
  };

  return (
    <>
      <div className="league-seasons-section">
        <div className="league-section-header">
          <h3 className="league-section-title">
            <Calendar size={18} />
            Seasons
          </h3>
          {isLeagueAdmin && (
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
            {seasons.map((season) => {
              const isActive = isSeasonActive(season);
              const isPast = isSeasonPast(season);
              return (
                <div key={season.id} className="league-season-item">
                  <div className="league-season-content">
                    <h4 className="league-season-name">
                      {season.name || `Season ${season.id}`}
                      {isLeagueAdmin && (
                        <button
                          className="edit-season-button"
                          onClick={() => handleEditSeason(season)}
                          title="Edit Season"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </h4>
                    <p className="league-season-dates">
                      {formatDateRange(season.start_date, season.end_date)}
                    </p>
                    {season.scoring_system && (
                      <p className="league-season-scoring">
                        {season.scoring_system === "points_system" ? "Points System" : "Season Rating"}
                        {season.scoring_system === "points_system" && season.point_system && (() => {
                          try {
                            const config = JSON.parse(season.point_system);
                            if (config.points_per_win !== undefined && config.points_per_loss !== undefined) {
                              return ` (${config.points_per_win}/${config.points_per_loss})`;
                            }
                          } catch (e) {}
                          return "";
                        })()}
                      </p>
                    )}
                  </div>
                  {isActive && (
                    <span className="league-season-active">Active</span>
                  )}
                  {isPast && !isActive && (
                    <span className="league-season-past">Past</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EditSeasonModal
        isOpen={!!editingSeason}
        onClose={() => setEditingSeason(null)}
        onSuccess={handleEditSuccess}
        season={editingSeason}
      />
    </>
  );
}
