import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { createLeagueSeason } from "../../services/api";
import { useLeague } from "../../contexts/LeagueContext";

export default function CreateSeasonModal({ isOpen, onClose, onSuccess }) {
  const { leagueId, showMessage } = useLeague();
  const [formData, setFormData] = useState({
    name: "",
    start_date: "",
    end_date: "",
  });

  useEffect(() => {
    if (!isOpen) {
      setFormData({ name: "", start_date: "", end_date: "" });
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!formData.start_date || !formData.end_date) {
      showMessage?.("error", "Start date and end date are required");
      return;
    }

    try {
      await createLeagueSeason(leagueId, {
        name: formData.name || undefined,
        start_date: formData.start_date,
        end_date: formData.end_date,
      });
      onSuccess();
      onClose();
    } catch (err) {
      showMessage?.(
        "error",
        err.response?.data?.detail || "Failed to create season"
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Season</h2>
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
            Create Season
          </button>
        </div>
      </div>
    </div>
  );
}
