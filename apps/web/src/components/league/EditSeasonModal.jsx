import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { updateSeason } from "../../services/api";
import { useLeague } from "../../contexts/LeagueContext";
import { SEASON_RATING_DESCRIPTION } from "./utils/leagueUtils";

export default function EditSeasonModal({ isOpen, onClose, onSuccess, season }) {
  const { showMessage } = useLeague();
  const [formData, setFormData] = useState({
    name: "",
    start_date: "",
    end_date: "",
    scoring_system: "points_system",
    points_per_win: 3,
    points_per_loss: 1,
  });

  useEffect(() => {
    if (isOpen && season) {
      // Parse point_system JSON if available
      let scoringSystem = "points_system";
      let pointsPerWin = 3;
      let pointsPerLoss = 1;
      
      if (season.scoring_system) {
        scoringSystem = season.scoring_system;
      } else if (season.point_system) {
        try {
          const config = JSON.parse(season.point_system);
          if (config.type) {
            scoringSystem = config.type;
            if (config.points_per_win !== undefined) pointsPerWin = config.points_per_win;
            if (config.points_per_loss !== undefined) pointsPerLoss = config.points_per_loss;
          }
        } catch (e) {
          // Invalid JSON, use defaults
        }
      }
      
      setFormData({
        name: season.name || "",
        start_date: season.start_date || "",
        end_date: season.end_date || "",
        scoring_system: scoringSystem,
        points_per_win: pointsPerWin,
        points_per_loss: pointsPerLoss,
      });
    }
  }, [isOpen, season]);

  // Add modal-open class to body when modal is open (for iOS z-index fix)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    if (isOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    
    // Cleanup on unmount
    return () => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('modal-open');
      }
    };
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!formData.start_date || !formData.end_date) {
      showMessage?.("error", "Start date and end date are required");
      return;
    }

    try {
      const payload = {
        name: formData.name || undefined,
        start_date: formData.start_date,
        end_date: formData.end_date,
        scoring_system: formData.scoring_system,
      };
      
      if (formData.scoring_system === "points_system") {
        payload.points_per_win = formData.points_per_win;
        payload.points_per_loss = formData.points_per_loss;
      }
      
      await updateSeason(season.id, payload);
      onSuccess();
      onClose();
    } catch (err) {
      showMessage?.(
        "error",
        err.response?.data?.detail || "Failed to update season"
      );
    }
  };

  if (!isOpen || !season) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Season</h2>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="season-name">Season Name (Optional)</label>
            <input
              id="season-name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder={`e.g., Spring ${new Date().getFullYear()}`}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="season-start-date">
              Start Date <span className="required">*</span>
            </label>
            <input
              id="season-start-date"
              type="date"
              value={formData.start_date}
              onChange={(e) =>
                setFormData({ ...formData, start_date: e.target.value })
              }
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="season-end-date">
              End Date <span className="required">*</span>
            </label>
            <input
              id="season-end-date"
              type="date"
              value={formData.end_date}
              onChange={(e) =>
                setFormData({ ...formData, end_date: e.target.value })
              }
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="scoring-system">Scoring System <span className="required">*</span></label>
            <select
              id="scoring-system"
              value={formData.scoring_system}
              onChange={(e) =>
                setFormData({ ...formData, scoring_system: e.target.value })
              }
              className="form-input"
              required
            >
              <option value="points_system">Points System</option>
              <option value="season_rating">Season Rating</option>
            </select>
            {formData.scoring_system !== (season?.scoring_system || "points_system") && (
              <small className="form-warning-text">
                Changing scoring system will recalculate all stats. Initial rating will be preserved if it exists.
              </small>
            )}
          </div>
          {formData.scoring_system === "points_system" && (
            <>
              <div className="form-group">
                <label htmlFor="points-per-win">Points per Win</label>
                <input
                  id="points-per-win"
                  type="number"
                  value={formData.points_per_win}
                  onChange={(e) =>
                    setFormData({ ...formData, points_per_win: parseInt(e.target.value) || 3 })
                  }
                  className="form-input"
                  min="0"
                />
              </div>
              <div className="form-group">
                <label htmlFor="points-per-loss">Points per Loss (Positive to reward participation)</label>
                <input
                  id="points-per-loss"
                  type="number"
                  value={formData.points_per_loss}
                  onChange={(e) =>
                    setFormData({ ...formData, points_per_loss: parseInt(e.target.value) || 1 })
                  }
                  className="form-input"
                />
                <small className="form-help-text">Can be 0 or negative</small>
              </div>
            </>
          )}
          {formData.scoring_system === "season_rating" && (
            <div className="form-group">
              <div className="form-info-box">
                <p>
                  <strong>Season Rating:</strong> {SEASON_RATING_DESCRIPTION}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="league-text-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="league-text-button primary"
            onClick={handleSubmit}
            disabled={!formData.start_date || !formData.end_date}
          >
            Update Season
          </button>
        </div>
      </div>
    </div>
  );
}
