import { useState, useEffect, useMemo } from 'react';
import { Calendar, Plus, Edit2, Trash2, Users, Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/UI';
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
import CreateSignupModal from './CreateSignupModal';
import EditSignupModal from './EditSignupModal';
import CreateWeeklyScheduleModal from './CreateWeeklyScheduleModal';
import EditWeeklyScheduleModal from './EditWeeklyScheduleModal';
import SignupPlayersListModal from './SignupPlayersListModal';

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

export default function LeagueSignUpsTab({ leagueId, showMessage }) {
  const { seasons, members } = useLeague();
  const { currentUserPlayer } = useAuth();
  
  const [signups, setSignups] = useState([]);
  const [weeklySchedules, setWeeklySchedules] = useState([]);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedSignups, setExpandedSignups] = useState(new Set());
  const [expandedSchedules, setExpandedSchedules] = useState(new Set());
  
  // Modals
  const [showCreateSignupModal, setShowCreateSignupModal] = useState(false);
  const [showEditSignupModal, setShowEditSignupModal] = useState(false);
  const [editingSignup, setEditingSignup] = useState(null);
  const [showCreateScheduleModal, setShowCreateScheduleModal] = useState(false);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [showPlayersModal, setShowPlayersModal] = useState(false);
  const [selectedSignupForPlayers, setSelectedSignupForPlayers] = useState(null);
  
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
    setExpandedSignups(prev => {
      const next = new Set(prev);
      if (next.has(signupId)) {
        next.delete(signupId);
      } else {
        next.add(signupId);
      }
      return next;
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
  
  const handleViewPlayers = async (signupId) => {
    try {
      const signup = await getSignup(signupId);
      setSelectedSignupForPlayers(signup);
      setShowPlayersModal(true);
    } catch (err) {
      showMessage?.('error', 'Failed to load players');
    }
  };
  
  const isPlayerSignedUp = (signup) => {
    if (!currentUserPlayer || !signup.players) return false;
    return signup.players.some(p => p.player_id === currentUserPlayer.id);
  };
  
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  if (!activeSeason) {
    return (
      <div className="league-section">
        <div className="empty-state">
          <Calendar size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <p>No active season. Please create an active season to manage signups.</p>
        </div>
      </div>
    );
  }
  
  const upcomingSignups = signups.filter(s => !s.is_past);
  const pastSignups = signups.filter(s => s.is_past);
  
  return (
    <div className="league-section">
      <div className="section-header">
        <h2 className="section-title">
          <Calendar size={20} />
          Sign Ups
        </h2>
        {isAdmin && (
          <Button 
            variant="success" 
            size="small"
            onClick={() => setShowCreateSignupModal(true)}
          >
            <Plus size={16} />
            Create Signup
          </Button>
        )}
      </div>
      
      {loading ? (
        <div className="empty-state">
          <p>Loading signups...</p>
        </div>
      ) : (
        <>
          {/* Upcoming Signups */}
          <div className="signups-section">
            <h3 className="subsection-title">Upcoming Signups</h3>
            {upcomingSignups.length === 0 ? (
              <div className="empty-state">
                <Calendar size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p>No upcoming signups. {isAdmin && 'Create a signup or weekly schedule to get started.'}</p>
              </div>
            ) : (
              <div className="signups-list">
                {upcomingSignups.map(signup => {
                  const isSignedUp = isPlayerSignedUp(signup);
                  const isExpanded = expandedSignups.has(signup.id);
                  
                  return (
                    <div key={signup.id} className={`signup-card ${signup.is_past ? 'past' : ''} ${!signup.is_open ? 'closed' : ''}`}>
                      <div className="signup-card-header">
                        <div className="signup-card-main">
                          <div className="signup-card-info">
                            <div className="signup-card-title">
                              {formatDate(signup.scheduled_datetime)} at {formatTime(signup.scheduled_datetime)}
                            </div>
                            <div className="signup-card-meta">
                              <span className="signup-meta-item">
                                <Clock size={14} />
                                {signup.duration_hours} hours
                              </span>
                              {signup.court_id && (
                                <span className="signup-meta-item">
                                  <MapPin size={14} />
                                  Court {signup.court_id}
                                </span>
                              )}
                              <span className="signup-meta-item">
                                <Users size={14} />
                                {signup.player_count} {signup.player_count === 1 ? 'player' : 'players'}
                              </span>
                            </div>
                            {!signup.is_open && (
                              <div className="signup-status-badge closed">
                                Opens {formatDateTimeWithTimezone(signup.open_signups_at)}
                              </div>
                            )}
                          </div>
                          <div className="signup-card-actions">
                            {isLeagueMember && signup.is_open && (
                              <Button
                                variant={isSignedUp ? "danger" : "success"}
                                size="small"
                                onClick={() => isSignedUp ? handleDropout(signup.id) : handleSignup(signup.id)}
                              >
                                {isSignedUp ? 'Drop Out' : 'Sign Up'}
                              </Button>
                            )}
                            {signup.player_count > 0 && (
                              <Button
                                variant="secondary"
                                size="small"
                                onClick={() => handleViewPlayers(signup.id)}
                              >
                                <Users size={14} />
                                View Players
                              </Button>
                            )}
                            {isAdmin && (
                              <>
                                <Button
                                  variant="secondary"
                                  size="small"
                                  onClick={() => {
                                    setEditingSignup(signup);
                                    setShowEditSignupModal(true);
                                  }}
                                >
                                  <Edit2 size={14} />
                                  Edit
                                </Button>
                                <Button
                                  variant="danger"
                                  size="small"
                                  onClick={() => handleDeleteSignup(signup.id)}
                                >
                                  <Trash2 size={14} />
                                  Delete
                                </Button>
                              </>
                            )}
                            {signup.players && signup.players.length > 0 && (
                              <Button
                                variant="ghost"
                                size="small"
                                onClick={() => toggleSignupExpanded(signup.id)}
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      {isExpanded && signup.players && signup.players.length > 0 && (
                        <div className="signup-card-players">
                          <div className="signup-players-list">
                            {signup.players.map((player, idx) => (
                              <div key={idx} className="signup-player-item">
                                <span className="player-name">{player.player_name}</span>
                                <span className="player-signed-up-at">
                                  Signed up {formatDateTimeWithTimezone(player.signed_up_at)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Past Signups (collapsed by default) */}
          {pastSignups.length > 0 && (
            <div className="signups-section">
              <h3 className="subsection-title">Past Signups</h3>
              <div className="signups-list">
                {pastSignups.map(signup => (
                  <div key={signup.id} className="signup-card past">
                    <div className="signup-card-header">
                      <div className="signup-card-main">
                        <div className="signup-card-info">
                          <div className="signup-card-title">
                            {formatDate(signup.scheduled_datetime)} at {formatTime(signup.scheduled_datetime)}
                          </div>
                          <div className="signup-card-meta">
                            <span className="signup-meta-item">
                              <Users size={14} />
                              {signup.player_count} {signup.player_count === 1 ? 'player' : 'players'}
                            </span>
                          </div>
                        </div>
                        <div className="signup-card-actions">
                          {signup.player_count > 0 && (
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => handleViewPlayers(signup.id)}
                            >
                              <Users size={14} />
                              View Players
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Weekly Schedules (Admin only) */}
          {isAdmin && (
            <div className="signups-section">
              <div className="section-header">
                <h3 className="subsection-title">Weekly Schedules</h3>
                <Button 
                  variant="success" 
                  size="small"
                  onClick={() => setShowCreateScheduleModal(true)}
                >
                  <Plus size={16} />
                  Create Weekly Schedule
                </Button>
              </div>
              {weeklySchedules.length === 0 ? (
                <div className="empty-state">
                  <Calendar size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                  <p>No weekly schedules. Create one to automatically generate signups.</p>
                </div>
              ) : (
                <div className="schedules-list">
                  {weeklySchedules.map(schedule => {
                    const isExpanded = expandedSchedules.has(schedule.id);
                    return (
                      <div key={schedule.id} className="schedule-card">
                        <div className="schedule-card-header">
                          <div className="schedule-card-main">
                            <div className="schedule-card-info">
                              <div className="schedule-card-title">
                                {dayNames[schedule.day_of_week]} at {schedule.start_time} ({schedule.duration_hours} hours)
                              </div>
                              <div className="schedule-card-meta">
                                <span>Ends: {formatDate(schedule.end_date)}</span>
                                <span>Mode: {schedule.open_signups_mode.replace(/_/g, ' ')}</span>
                              </div>
                            </div>
                            <div className="schedule-card-actions">
                              <Button
                                variant="secondary"
                                size="small"
                                onClick={() => {
                                  setEditingSchedule(schedule);
                                  setShowEditScheduleModal(true);
                                }}
                              >
                                <Edit2 size={14} />
                                Edit
                              </Button>
                              <Button
                                variant="danger"
                                size="small"
                                onClick={() => handleDeleteSchedule(schedule.id)}
                              >
                                <Trash2 size={14} />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
      
      {/* Modals */}
      {showCreateSignupModal && (
        <CreateSignupModal
          seasonId={activeSeason.id}
          onClose={() => setShowCreateSignupModal(false)}
          onSubmit={handleCreateSignup}
        />
      )}
      
      {showEditSignupModal && editingSignup && (
        <EditSignupModal
          signup={editingSignup}
          onClose={() => {
            setShowEditSignupModal(false);
            setEditingSignup(null);
          }}
          onSubmit={(data) => handleUpdateSignup(editingSignup.id, data)}
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
      
      {showPlayersModal && selectedSignupForPlayers && (
        <SignupPlayersListModal
          signup={selectedSignupForPlayers}
          onClose={() => {
            setShowPlayersModal(false);
            setSelectedSignupForPlayers(null);
          }}
        />
      )}
    </div>
  );
}

