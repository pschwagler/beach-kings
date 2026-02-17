import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getCourts } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

// Helper to convert local datetime to UTC ISO string
function localToUTCISOString(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const localDate = new Date(`${dateStr}T${timeStr}`);
  return localDate.toISOString();
}

// Helper to convert UTC ISO string to local date/time
function utcToLocalDateTime(isoString) {
  if (!isoString) return { date: '', time: '' };
  const date = new Date(isoString);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = date.toLocaleDateString('en-CA', { timeZone }); // YYYY-MM-DD format
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false,
    timeZone 
  });
  return { date: dateStr, time: timeStr };
}

// Helper to get timezone abbreviation
function getTimezoneAbbr() {
  const date = new Date();
  const timeZoneName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  return timeZoneName;
}

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get next hour rounded up (e.g., 11:37 -> 12:00)
function getNextHour() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  const hours = String(nextHour.getHours()).padStart(2, '0');
  const minutes = String(nextHour.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export default function SignupModal({ signup, seasonId, onClose, onSubmit }) {
  const { showToast } = useToast();
  const isEditMode = !!signup;
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Initialize form data
  const scheduled = signup ? utcToLocalDateTime(signup.scheduled_datetime) : { date: getTodayDate(), time: getNextHour() };
  
  const [formData, setFormData] = useState({
    scheduled_date: scheduled.date,
    scheduled_time: scheduled.time,
    duration_hours: signup?.duration_hours?.toString() || '2.0',
    court_id: signup?.court_id?.toString() || ''
  });
  
  useEffect(() => {
    const loadCourts = async () => {
      try {
        const courtsData = await getCourts();
        setCourts(courtsData || []);
      } catch (err) {
        console.error('Error loading courts:', err);
      } finally {
        setLoading(false);
      }
    };
    loadCourts();
  }, []);
  
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
    
    // Don't send open_signups_at - backend will default to now (immediately open) for new signups
    // For edits, we don't change open_signups_at
    try {
      await onSubmit({
        scheduled_datetime,
        duration_hours: parseFloat(formData.duration_hours) || 2.0,
        court_id: formData.court_id ? parseInt(formData.court_id) : null
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
          <h2>{isEditMode ? 'Edit Session' : 'Schedule New Session for Sign Ups'}</h2>
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
            <label htmlFor="court">Court</label>
            <select
              id="court"
              value={formData.court_id}
              onChange={(e) => setFormData({ ...formData, court_id: e.target.value })}
              className="form-input"
            >
              <option value="">No court selected</option>
              {loading ? (
                <option disabled>Loading courts...</option>
              ) : (
                courts.map(court => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))
              )}
            </select>
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
            {isEditMode ? 'Update Session' : 'Schedule Session'}
          </button>
        </div>
      </div>
    </div>
  );
}
