import { useState } from 'react';
import { X } from 'lucide-react';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' }
];

export default function CreateWeeklyScheduleModal({ seasonId, seasonEndDate, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    day_of_week: '0',
    start_time: '18:00',
    duration_hours: '2.0',
    court_id: '',
    open_signups_mode: 'auto_after_last_session',
    open_signups_day_of_week: '',
    open_signups_time: '',
    end_date: seasonEndDate || ''
  });
  
  const handleSubmit = async () => {
    if (!formData.day_of_week || !formData.start_time || !formData.end_date) {
      alert('Day of week, start time, and end date are required');
      return;
    }
    
    if (formData.open_signups_mode === 'specific_day_time') {
      if (!formData.open_signups_day_of_week || !formData.open_signups_time) {
        alert('Open signups day and time are required for specific day/time mode');
        return;
      }
    }
    
    // Convert local time to UTC for start_time
    // We use a reference date to properly handle DST
    const convertLocalTimeToUTC = (localTimeStr) => {
      if (!localTimeStr) return localTimeStr;
      const [hours, minutes] = localTimeStr.split(':').map(Number);
      // Use today as reference date to handle DST correctly
      const today = new Date();
      const localDateTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
      // Get UTC time components
      const utcHours = String(localDateTime.getUTCHours()).padStart(2, '0');
      const utcMinutes = String(localDateTime.getUTCMinutes()).padStart(2, '0');
      return `${utcHours}:${utcMinutes}`;
    };
    
    // Convert times to UTC before sending
    const utcStartTime = convertLocalTimeToUTC(formData.start_time);
    const utcOpenSignupsTime = formData.open_signups_time ? convertLocalTimeToUTC(formData.open_signups_time) : null;
    
    try {
      await onSubmit({
        day_of_week: parseInt(formData.day_of_week),
        start_time: utcStartTime,
        duration_hours: parseFloat(formData.duration_hours) || 2.0,
        court_id: formData.court_id ? parseInt(formData.court_id) : null,
        open_signups_mode: formData.open_signups_mode,
        open_signups_day_of_week: formData.open_signups_day_of_week ? parseInt(formData.open_signups_day_of_week) : null,
        open_signups_time: utcOpenSignupsTime,
        end_date: formData.end_date
      });
      onClose();
    } catch (err) {
      // Error handling is done in parent
    }
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Weekly Scheduled Session</h2>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="day-of-week">
              Day of Week <span className="required">*</span>
            </label>
            <select
              id="day-of-week"
              value={formData.day_of_week}
              onChange={(e) => setFormData({ ...formData, day_of_week: e.target.value })}
              className="form-input"
              required
            >
              {DAYS_OF_WEEK.map(day => (
                <option key={day.value} value={day.value}>{day.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="start-time">
              Start Time <span className="required">*</span>
            </label>
            <input
              id="start-time"
              type="time"
              value={formData.start_time}
              onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
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
            <label htmlFor="court-id">Court ID (Optional)</label>
            <input
              id="court-id"
              type="number"
              value={formData.court_id}
              onChange={(e) => setFormData({ ...formData, court_id: e.target.value })}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="open-signups-mode">Open Signups Mode</label>
            <select
              id="open-signups-mode"
              value={formData.open_signups_mode}
              onChange={(e) => setFormData({ ...formData, open_signups_mode: e.target.value })}
              className="form-input"
            >
              <option value="auto_after_last_session">Signup is available immediately after final session of previous week</option>
              <option value="specific_day_time">Weekly signups open at a specific day/time of previous week</option>
              <option value="always_open">Open for signup whenever</option>
            </select>
          </div>
          {formData.open_signups_mode === 'specific_day_time' && (
            <>
              <div className="form-group">
                <label htmlFor="open-signups-day">Open Signups Day</label>
                <select
                  id="open-signups-day"
                  value={formData.open_signups_day_of_week}
                  onChange={(e) => setFormData({ ...formData, open_signups_day_of_week: e.target.value })}
                  className="form-input"
                >
                  <option value="">Select day</option>
                  {DAYS_OF_WEEK.map(day => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="open-signups-time">Open Signups Time</label>
                <input
                  id="open-signups-time"
                  type="time"
                  value={formData.open_signups_time}
                  onChange={(e) => setFormData({ ...formData, open_signups_time: e.target.value })}
                  className="form-input"
                />
              </div>
            </>
          )}
          <div className="form-group">
            <label htmlFor="end-date">
              End Date <span className="required">*</span>
            </label>
            <input
              id="end-date"
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className="form-input"
              max={seasonEndDate}
              required
            />
            <small>Cannot exceed season end date ({seasonEndDate}) or 6 months from today</small>
          </div>
        </div>
        <div className="modal-actions">
          <button className="league-text-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="league-text-button primary"
            onClick={handleSubmit}
            disabled={!formData.day_of_week || !formData.start_time || !formData.end_date}
          >
            Create Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

