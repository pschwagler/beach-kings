import { useState } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useLeague } from '../../contexts/LeagueContext';
import CourtSelector from '../court/CourtSelector';

/**
 * Helper to convert local datetime to UTC ISO string.
 */
function localToUTCISOString(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const localDate = new Date(`${dateStr}T${timeStr}`);
  return localDate.toISOString();
}

/**
 * Get timezone abbreviation (e.g. "PST", "EDT").
 */
function getTimezoneAbbr() {
  const date = new Date();
  return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value || '';
}

/**
 * Get today's date in YYYY-MM-DD format.
 */
function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get next hour rounded up (e.g., 11:37 -> 12:00).
 */
function getNextHour() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  return `${String(nextHour.getHours()).padStart(2, '0')}:${String(nextHour.getMinutes()).padStart(2, '0')}`;
}

/**
 * Modal for scheduling a new session for sign ups.
 *
 * Uses CourtSelector with league home courts as quick picks.
 * Defaults to the primary (first) home court if one exists.
 *
 * @param {Object} props
 * @param {number} props.seasonId - Season to create signup in
 * @param {() => void} props.onClose - Close handler
 * @param {(data: Object) => Promise} props.onSubmit - Submit handler
 */
interface CreateSignupModalProps {
  seasonId: number;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}

export default function CreateSignupModal({ seasonId, onClose, onSubmit }: CreateSignupModalProps) {
  const { showToast } = useToast();
  const { league, isLeagueAdmin } = useLeague();

  const homeCourts = league?.home_courts || [];
  const [formData, setFormData] = useState({
    scheduled_date: getTodayDate(),
    scheduled_time: getNextHour(),
    duration_hours: '2.0',
    court_id: homeCourts.length > 0 ? homeCourts[0].id : null,
  });

  const handleSubmit = async () => {
    if (!formData.scheduled_date || !formData.scheduled_time) {
      showToast('Scheduled date and time are required', 'error');
      return;
    }

    const scheduled_datetime = localToUTCISOString(formData.scheduled_date, formData.scheduled_time);
    if (!scheduled_datetime) {
      showToast('Invalid date/time format', 'error');
      return;
    }

    try {
      await onSubmit({
        scheduled_datetime,
        duration_hours: parseFloat(formData.duration_hours) || 2.0,
        court_id: formData.court_id || null,
      });
    } catch (err) {
      // Error handling is done in parent
    }
  };

  const timezoneAbbr = getTimezoneAbbr();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Schedule New Session for Sign Ups</h2>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="scheduled-date">
              Scheduled Date <span className="required">*</span>
            </label>
            <input
              id="scheduled-date"
              type="date"
              value={formData.scheduled_date}
              onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="scheduled-time">
              Scheduled Time ({timezoneAbbr}) <span className="required">*</span>
            </label>
            <input
              id="scheduled-time"
              type="time"
              value={formData.scheduled_time}
              onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="duration-hours">Duration (hours)</label>
            <input
              id="duration-hours"
              type="number"
              step="0.5"
              min="0.5"
              value={formData.duration_hours}
              onChange={(e) => setFormData({ ...formData, duration_hours: e.target.value })}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <CourtSelector
              value={formData.court_id}
              onChange={(courtId) => setFormData({ ...formData, court_id: courtId })}
              homeCourts={homeCourts}
              preFilterLocationId={league?.location_id}
              label="Court"
            />
            {isLeagueAdmin && (
              <a
                href={`/league/${league?.id}?tab=details`}
                className="court-selector__manage-link"
                onClick={onClose}
              >
                Manage home courts &rarr;
              </a>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="league-text-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="league-text-button primary"
            onClick={handleSubmit}
            disabled={!formData.scheduled_date || !formData.scheduled_time}
          >
            Schedule Session
          </button>
        </div>
      </div>
    </div>
  );
}
