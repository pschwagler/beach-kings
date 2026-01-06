import { Calendar, Edit2, Trash2 } from 'lucide-react';
import { formatDate, utcTimeToLocalWithTimezone } from '../../../utils/dateUtils';

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Component for rendering weekly schedule list
 */
export default function ScheduleList({
  schedules,
  isLeagueAdmin = false,
  onEdit,
  onDelete,
}) {
  if (schedules.length === 0) {
    return (
      <div className="league-empty-state">
        <Calendar size={40} />
        <p>No weekly schedules. Create one to automatically generate signups.</p>
      </div>
    );
  }

  return (
    <div className="league-schedules-list">
      {schedules.map(schedule => (
        <div key={schedule.id} className="league-schedule-row">
          <div className="league-schedule-info">
            <div className="league-schedule-main">
              <div className="league-schedule-details">
                <div className="league-schedule-title">
                  {dayNames[schedule.day_of_week]} at {utcTimeToLocalWithTimezone(schedule.start_time)} ({schedule.duration_hours} hours)
                </div>
                <div className="league-schedule-meta">
                  <span>Ends: {formatDate(schedule.end_date)}</span>
                  <span>Mode: {schedule.open_signups_mode.replace(/_/g, ' ')}</span>
                </div>
              </div>
              {isLeagueAdmin && (
                <div className="league-schedule-actions">
                  <button
                    className="league-text-button"
                    onClick={() => onEdit(schedule)}
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                  <button
                    className="league-schedule-remove"
                    onClick={() => onDelete(schedule.id)}
                    title="Delete schedule"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
