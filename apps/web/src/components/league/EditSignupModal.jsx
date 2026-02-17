import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

// Helper to convert UTC ISO string to local date/time
function utcToLocalDateTime(isoString) {
  if (!isoString) return { date: '', time: '' };
  const date = new Date(isoString);
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.toTimeString().slice(0, 5); // HH:MM
  return { date: dateStr, time: timeStr };
}

// Helper to convert local datetime to UTC ISO string
function localToUTCISOString(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const localDate = new Date(`${dateStr}T${timeStr}`);
  return localDate.toISOString();
}

export default function EditSignupModal({ signup, onClose, onSubmit }) {
  const { showToast } = useToast();
  const scheduled = utcToLocalDateTime(signup.scheduled_datetime);
  const openSignups = utcToLocalDateTime(signup.open_signups_at);
  
  const [formData, setFormData] = useState({
    scheduled_date: scheduled.date,
    scheduled_time: scheduled.time,
    duration_hours: signup.duration_hours?.toString() || '2.0',
    court_id: signup.court_id?.toString() || '',
    open_signups_date: openSignups.date,
    open_signups_time: openSignups.time
  });
  
  const handleSubmit = async () => {
    if (!formData.scheduled_date || !formData.scheduled_time) {
      showToast('Scheduled date and time are required', 'error');
      return;
    }
    
    if (!formData.open_signups_date || !formData.open_signups_time) {
      showToast('Open signups date and time are required', 'error');
      return;
    }
    
    const scheduled_datetime = localToUTCISOString(formData.scheduled_date, formData.scheduled_time);
    const open_signups_at = localToUTCISOString(formData.open_signups_date, formData.open_signups_time);
    
    if (!scheduled_datetime || !open_signups_at) {
      showToast('Invalid date/time format', 'error');
      return;
    }
    
    try {
      await onSubmit({
        scheduled_datetime,
        duration_hours: parseFloat(formData.duration_hours) || 2.0,
        court_id: formData.court_id ? parseInt(formData.court_id) : null,
        open_signups_at
      });
    } catch (err) {
      // Error handling is done in parent
    }
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Signup</h2>
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
              Scheduled Time <span className="required">*</span>
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
            <label htmlFor="open-signups-date">
              Open Signups Date <span className="required">*</span>
            </label>
            <input
              id="open-signups-date"
              type="date"
              value={formData.open_signups_date}
              onChange={(e) => setFormData({ ...formData, open_signups_date: e.target.value })}
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="open-signups-time">
              Open Signups Time <span className="required">*</span>
            </label>
            <input
              id="open-signups-time"
              type="time"
              value={formData.open_signups_time}
              onChange={(e) => setFormData({ ...formData, open_signups_time: e.target.value })}
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
            disabled={!formData.scheduled_date || !formData.scheduled_time || !formData.open_signups_date || !formData.open_signups_time}
          >
            Update Signup
          </button>
        </div>
      </div>
    </div>
  );
}
