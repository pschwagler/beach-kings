import { useState, useEffect, useMemo } from 'react';
import { Calendar, Plus, Edit2, Trash2, Users, Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSignups,
  createSignup,
  updateSignup,
  deleteSignup,
  signupForSignup,
  dropoutFromSignup,
  getSignup,
  getWeeklySchedules,
  createWeeklySchedule,
  updateWeeklySchedule,
  deleteWeeklySchedule,
  getLocations
} from '../../services/api';
import SignupModal from './SignupModal';
import CreateWeeklyScheduleModal from './CreateWeeklyScheduleModal';
import EditWeeklyScheduleModal from './EditWeeklyScheduleModal';

// Helper function to format datetime with timezone
function formatDateTimeWithTimezone(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZoneName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  
  const dateStr = date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    timeZone 
  });
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone 
  });
  
  return `${dateStr} at ${timeStr} ${timeZoneName}`;
}

// Helper function to format date only
function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    timeZone 
  });
}

// Helper function to format time only
function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone 
  });
  const timeZoneName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  return `${timeStr} ${timeZoneName}`;
}

// Helper to convert UTC time string (HH:MM) to local time string
function utcTimeToLocal(utcTimeStr) {
  if (!utcTimeStr) return utcTimeStr;
  const [hours, minutes] = utcTimeStr.split(':').map(Number);
  // Use today as reference date to handle DST correctly
  const today = new Date();
  const utcDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hours, minutes));
  // Get local time components
  const localHours = String(utcDate.getHours()).padStart(2, '0');
  const localMinutes = String(utcDate.getMinutes()).padStart(2, '0');
  return `${localHours}:${localMinutes}`;
}

export default function LeagueSignUpsTab({ leagueId, showMessage }) {
  const { seasons, members } = useLeague();
  const { currentUserPlayer } = useAuth();
  
  const [signups, setSignups] = useState([]);
  const [weeklySchedules, setWeeklySchedules] = useState([]);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [collapsedSignups, setCollapsedSignups] = useState(new Set()); // Track which ones are manually collapsed
  const [expandedSchedules, setExpandedSchedules] = useState(new Set());
  
  // Modals
  const [showCreateSignupModal, setShowCreateSignupModal] = useState(false);
  const [showEditSignupModal, setShowEditSignupModal] = useState(false);
  const [editingSignup, setEditingSignup] = useState(null);
  const [showCreateScheduleModal, setShowCreateScheduleModal] = useState(false);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  
  // Compute isAdmin and isLeagueMember
  const isAdmin = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    const userMember = members.find(m => m.player_id === currentUserPlayer.id);
    return userMember?.role === 'admin';
  }, [currentUserPlayer, members]);
  
  const isLeagueMember = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    return members.some(m => m.player_id === currentUserPlayer.id);
  }, [currentUserPlayer, members]);
  
  // Get active season
  const activeSeason = useMemo(() => {
    return seasons.find(s => s.is_active === true || s.is_active === 1);
  }, [seasons]);
  
  // Load signups and schedules
  useEffect(() => {
    if (activeSeason) {
      loadSignups();
      loadWeeklySchedules();
    }
  }, [activeSeason]);
  
  // Load courts
  useEffect(() => {
    loadCourts();
  }, []);
  
  const loadCourts = async () => {
    try {
      const locations = await getLocations();
      // Flatten courts from all locations
      const allCourts = [];
      locations.forEach(loc => {
        // Note: This assumes locations have courts. You may need to adjust based on your API
        // For now, we'll just store locations as courts if needed
      });
      setCourts(allCourts);
    } catch (err) {
      console.error('Error loading courts:', err);
    }
  };
  
  const loadSignups = async () => {
    if (!activeSeason) return;
    setLoading(true);
    try {
      const data = await getSignups(activeSeason.id, { upcoming_only: false });
      // Load players for each signup
      const signupsWithPlayers = await Promise.all(
        data.map(async (signup) => {
          try {
            const fullSignup = await getSignup(signup.id);
            return fullSignup;
          } catch (err) {
            console.error(`Error loading players for signup ${signup.id}:`, err);
            return signup; // Return signup without players if error
          }
        })
      );
      setSignups(signupsWithPlayers);
      // Signups are expanded by default, so we don't need to initialize expandedSignups
    } catch (err) {
      console.error('Error loading signups:', err);
      showMessage?.('error', 'Failed to load signups');
    } finally {
      setLoading(false);
    }
  };
  
  const loadWeeklySchedules = async () => {
    if (!activeSeason) return;
    try {
      const data = await getWeeklySchedules(activeSeason.id);
      setWeeklySchedules(data);
    } catch (err) {
      console.error('Error loading weekly schedules:', err);
      showMessage?.('error', 'Failed to load weekly schedules');
    }
  };
  
  const handleCreateSignup = async (signupData) => {
    if (!activeSeason) return;
    try {
      await createSignup(activeSeason.id, signupData);
      showMessage?.('success', 'Signup created successfully');
      setShowCreateSignupModal(false);
      await loadSignups();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to create signup');
      throw err;
    }
  };
  
  const handleUpdateSignup = async (signupId, signupData) => {
    try {
      await updateSignup(signupId, signupData);
      showMessage?.('success', 'Signup updated successfully');
      setShowEditSignupModal(false);
      setEditingSignup(null);
      await loadSignups();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update signup');
      throw err;
    }
  };
  
  const handleDeleteSignup = async (signupId) => {
    if (!confirm('Are you sure you want to delete this signup?')) return;
    try {
      await deleteSignup(signupId);
      showMessage?.('success', 'Signup deleted successfully');
      await loadSignups();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete signup');
    }
  };
  
  const handleSignup = async (signupId) => {
    try {
      await signupForSignup(signupId);
      showMessage?.('success', 'Signed up successfully');
      await loadSignups();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to sign up');
    }
  };
  
  const handleDropout = async (signupId) => {
    try {
      await dropoutFromSignup(signupId);
      showMessage?.('success', 'Dropped out successfully');
      await loadSignups();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to drop out');
    }
  };
  
  const handleCreateSchedule = async (scheduleData) => {
    if (!activeSeason) return;
    try {
      await createWeeklySchedule(activeSeason.id, scheduleData);
      showMessage?.('success', 'Weekly schedule created successfully');
      setShowCreateScheduleModal(false);
      await loadWeeklySchedules();
      await loadSignups(); // Reload signups as new ones may have been generated
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to create weekly schedule');
      throw err;
    }
  };
  
  const handleUpdateSchedule = async (scheduleId, scheduleData) => {
    try {
      await updateWeeklySchedule(scheduleId, scheduleData);
      showMessage?.('success', 'Weekly schedule updated successfully');
      setShowEditScheduleModal(false);
      setEditingSchedule(null);
      await loadWeeklySchedules();
      await loadSignups(); // Reload signups as they may have been regenerated
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update weekly schedule');
      throw err;
    }
  };
  
  const handleDeleteSchedule = async (scheduleId) => {
    if (!confirm('Are you sure you want to delete this weekly schedule? All generated signups will be deleted.')) return;
    try {
      await deleteWeeklySchedule(scheduleId);
      showMessage?.('success', 'Weekly schedule deleted successfully');
      await loadWeeklySchedules();
      await loadSignups();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete weekly schedule');
    }
  };
  
  const toggleSignupExpanded = (signupId) => {
    setCollapsedSignups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(signupId)) {
        newSet.delete(signupId); // Expand it
      } else {
        newSet.add(signupId); // Collapse it
      }
      return newSet;
    });
  };
  
  const toggleScheduleExpanded = (scheduleId) => {
    setExpandedSchedules(prev => {
      const next = new Set(prev);
      if (next.has(scheduleId)) {
        next.delete(scheduleId);
      } else {
        next.add(scheduleId);
      }
      return next;
    });
  };
  
  const isPlayerSignedUp = (signup) => {
    if (!currentUserPlayer || !signup.players) return false;
    return signup.players.some(p => p.player_id === currentUserPlayer.id);
  };
  
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  if (!activeSeason) {
    return (
      <div className="league-signups-section">
        <div className="league-empty-state">
          <Calendar size={40} />
          <p>No active season. Please create an active season to manage signups.</p>
        </div>
      </div>
    );
  }
  
  const upcomingSignups = signups.filter(s => !s.is_past);
  const pastSignups = signups.filter(s => s.is_past);
  
  return (
    <div className="league-details-new">
      {/* Upcoming Signups Section */}
      <div className="league-signups-section">
        <div className="league-section-header">
          <h3 className="league-section-title">
            <Calendar size={18} />
            Upcoming Signups
          </h3>
          {isAdmin && (
            <button className="league-text-button" onClick={() => setShowCreateSignupModal(true)}>
              <Plus size={16} />
              Schedule New Session
            </button>
          )}
        </div>
        
        {loading ? (
          <div className="league-empty-state">
            <p>Loading signups...</p>
          </div>
        ) : upcomingSignups.length === 0 ? (
          <div className="league-empty-state">
            <Calendar size={40} />
            <p>No upcoming signups. {isAdmin && 'Create a signup or weekly schedule to get started.'}</p>
          </div>
        ) : (
          <div className="league-signups-list">
            {upcomingSignups.map(signup => {
              const isSignedUp = isPlayerSignedUp(signup);
              // Signups are expanded by default unless manually collapsed
              const isExpanded = signup.players && signup.players.length > 0 && !collapsedSignups.has(signup.id);
              
              return (
                <div key={signup.id} className={`league-signup-row ${!signup.is_open ? 'closed' : ''} ${isSignedUp ? 'signed-up' : ''}`}>
                  <div className="league-signup-info">
                    <div className="league-signup-main">
                      <div className="league-signup-details">
                        <div className="league-signup-title">
                          {formatDate(signup.scheduled_datetime)} at {formatTime(signup.scheduled_datetime)}
                        </div>
                        <div className="league-signup-meta">
                          <span className="league-signup-meta-item">
                            <Clock size={14} />
                            {signup.duration_hours} hours
                          </span>
                          {signup.court_id && (
                            <span className="league-signup-meta-item">
                              <MapPin size={14} />
                              Court {signup.court_id}
                            </span>
                          )}
                          <span className="league-signup-meta-item">
                            <Users size={14} />
                            {signup.player_count} {signup.player_count === 1 ? 'player' : 'players'}
                          </span>
                        </div>
                        {!signup.is_open && (
                          <div className="league-signup-status">
                            Opens {formatDateTimeWithTimezone(signup.open_signups_at)}
                          </div>
                        )}
                      </div>
                      <div className="league-signup-actions">
                        {isLeagueMember && signup.is_open && (
                          <button
                            className={`league-text-button ${isSignedUp ? 'danger' : 'primary'}`}
                            onClick={() => isSignedUp ? handleDropout(signup.id) : handleSignup(signup.id)}
                          >
                            {isSignedUp ? 'Drop Out' : 'Sign Up'}
                          </button>
                        )}
                        {isAdmin && (
                          <>
                            <button
                              className="league-text-button"
                              onClick={() => {
                                setEditingSignup(signup);
                                setShowEditSignupModal(true);
                              }}
                            >
                              <Edit2 size={14} />
                              Edit
                            </button>
                            <button
                              className="league-signup-remove"
                              onClick={() => handleDeleteSignup(signup.id)}
                              title="Delete signup"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                        {signup.players && signup.players.length > 0 && (
                          <button
                            className="league-text-button"
                            onClick={() => toggleSignupExpanded(signup.id)}
                            title={isExpanded ? "Collapse players" : "Expand players"}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                    {isExpanded && signup.players && signup.players.length > 0 && (
                      <div className="league-signup-players">
                        {signup.players.map((player, idx) => (
                          <div key={idx} className="league-signup-player-item">
                            <span className="league-signup-player-name">{player.player_name}</span>
                            <span className="league-signup-player-time">
                              Signed up {formatDateTimeWithTimezone(player.signed_up_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Past Signups Section */}
      {pastSignups.length > 0 && (
        <div className="league-signups-section">
          <div className="league-section-header">
            <h3 className="league-section-title">
              <Calendar size={18} />
              Past Signups
            </h3>
          </div>
          <div className="league-signups-list">
            {pastSignups.map(signup => {
              const isSignedUpPast = isPlayerSignedUp(signup);
              return (
                <div key={signup.id} className={`league-signup-row past ${isSignedUpPast ? 'signed-up' : ''}`}>
                  <div className="league-signup-info">
                    <div className="league-signup-main">
                      <div className="league-signup-details">
                        <div className="league-signup-title">
                          {formatDate(signup.scheduled_datetime)} at {formatTime(signup.scheduled_datetime)}
                        </div>
                        <div className="league-signup-meta">
                          <span className="league-signup-meta-item">
                            <Users size={14} />
                            {signup.player_count} {signup.player_count === 1 ? 'player' : 'players'}
                          </span>
                        </div>
                      </div>
                      <div className="league-signup-actions">
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Weekly Schedules Section (Admin only) */}
      {isAdmin && (
        <div className="league-schedules-section">
          <div className="league-section-header">
            <h3 className="league-section-title">
              <Calendar size={18} />
              Weekly Schedules
            </h3>
            <button className="league-text-button" onClick={() => setShowCreateScheduleModal(true)}>
              <Plus size={16} />
              Create Weekly Schedule
            </button>
          </div>
          {weeklySchedules.length === 0 ? (
            <div className="league-empty-state">
              <Calendar size={40} />
              <p>No weekly schedules. Create one to automatically generate signups.</p>
            </div>
          ) : (
            <div className="league-schedules-list">
              {weeklySchedules.map(schedule => (
                <div key={schedule.id} className="league-schedule-row">
                  <div className="league-schedule-info">
                    <div className="league-schedule-main">
                      <div className="league-schedule-details">
                        <div className="league-schedule-title">
                          {dayNames[schedule.day_of_week]} at {utcTimeToLocal(schedule.start_time)} ({schedule.duration_hours} hours)
                        </div>
                        <div className="league-schedule-meta">
                          <span>Ends: {formatDate(schedule.end_date)}</span>
                          <span>Mode: {schedule.open_signups_mode.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                      <div className="league-schedule-actions">
                        <button
                          className="league-text-button"
                          onClick={() => {
                            setEditingSchedule(schedule);
                            setShowEditScheduleModal(true);
                          }}
                        >
                          <Edit2 size={14} />
                          Edit
                        </button>
                        <button
                          className="league-schedule-remove"
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          title="Delete schedule"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Modals */}
      {(showCreateSignupModal || showEditSignupModal) && (
        <SignupModal
          signup={editingSignup}
          seasonId={activeSeason.id}
          onClose={() => {
            setShowCreateSignupModal(false);
            setShowEditSignupModal(false);
            setEditingSignup(null);
          }}
          onSubmit={async (data) => {
            if (editingSignup) {
              await handleUpdateSignup(editingSignup.id, data);
              setShowEditSignupModal(false);
              setEditingSignup(null);
            } else {
              await handleCreateSignup(data);
              setShowCreateSignupModal(false);
            }
          }}
        />
      )}
      
      {showCreateScheduleModal && (
        <CreateWeeklyScheduleModal
          seasonId={activeSeason.id}
          seasonEndDate={activeSeason.end_date}
          onClose={() => setShowCreateScheduleModal(false)}
          onSubmit={handleCreateSchedule}
        />
      )}
      
      {showEditScheduleModal && editingSchedule && (
        <EditWeeklyScheduleModal
          schedule={editingSchedule}
          seasonEndDate={activeSeason.end_date}
          onClose={() => {
            setShowEditScheduleModal(false);
            setEditingSchedule(null);
          }}
          onSubmit={(data) => handleUpdateSchedule(editingSchedule.id, data)}
        />
      )}
      
    </div>
  );
}

