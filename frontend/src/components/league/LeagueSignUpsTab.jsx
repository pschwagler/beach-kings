import { useState, useEffect, useMemo } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSignups,
  createSignup,
  updateSignup,
  deleteSignup,
  signupForSignup,
  dropoutFromSignup,
  getWeeklySchedules,
  createWeeklySchedule,
  updateWeeklySchedule,
  deleteWeeklySchedule,
  getLocations
} from '../../services/api';
import SignupList from './components/SignupList';
import ScheduleList from './components/ScheduleList';
import SignupModal from './SignupModal';
import CreateWeeklyScheduleModal from './CreateWeeklyScheduleModal';
import EditWeeklyScheduleModal from './EditWeeklyScheduleModal';
import ConfirmationModal from '../modal/ConfirmationModal';

export default function LeagueSignUpsTab() {
  const { seasons, members, leagueId, isLeagueAdmin, showMessage } = useLeague();
  const { currentUserPlayer } = useAuth();
  
  const [signups, setSignups] = useState([]);
  const [weeklySchedules, setWeeklySchedules] = useState([]);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Modals
  const [showCreateSignupModal, setShowCreateSignupModal] = useState(false);
  const [showEditSignupModal, setShowEditSignupModal] = useState(false);
  const [editingSignup, setEditingSignup] = useState(null);
  const [showCreateScheduleModal, setShowCreateScheduleModal] = useState(false);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [showDeleteScheduleModal, setShowDeleteScheduleModal] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState(null);
  
  // Get isLeagueMember from context
  const { isLeagueMember } = useLeague();
  
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
      // Load signups with players in a single request
      const data = await getSignups(activeSeason.id, { 
        upcoming_only: false,
        include_players: true 
      });
      setSignups(data);
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
      await loadSignups();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete signup');
    }
  };
  
  const handleSignup = async (signupId) => {
    try {
      await signupForSignup(signupId);
      await loadSignups();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to sign up');
    }
  };
  
  const handleDropout = async (signupId) => {
    try {
      await dropoutFromSignup(signupId);
      await loadSignups();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to drop out');
    }
  };
  
  const handleCreateSchedule = async (scheduleData) => {
    if (!activeSeason) return;
    try {
      await createWeeklySchedule(activeSeason.id, scheduleData);
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
      setShowEditScheduleModal(false);
      setEditingSchedule(null);
      await loadWeeklySchedules();
      await loadSignups(); // Reload signups as they may have been regenerated
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update weekly schedule');
      throw err;
    }
  };
  
  const handleDeleteSchedule = (scheduleId) => {
    setScheduleToDelete(scheduleId);
    setShowDeleteScheduleModal(true);
  };

  const confirmDeleteSchedule = async () => {
    if (!scheduleToDelete) return;
    try {
      await deleteWeeklySchedule(scheduleToDelete);
      setShowDeleteScheduleModal(false);
      setScheduleToDelete(null);
      await loadWeeklySchedules();
      await loadSignups();
      showMessage?.('success', 'Weekly schedule deleted successfully');
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete weekly schedule');
    }
  };
  
  
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
            Upcoming Sessions
          </h3>
          {isLeagueMember && (
            <button className="league-text-button" onClick={() => setShowCreateSignupModal(true)}>
              <Plus size={16} />
              Schedule New Session
            </button>
          )}
        </div>
        
        <SignupList
          signups={upcomingSignups}
          loading={loading}
          isUpcoming={true}
          isLeagueAdmin={isLeagueAdmin}
          currentUserPlayer={currentUserPlayer}
          onSignup={handleSignup}
          onDropout={handleDropout}
          onEdit={(signup) => {
            setEditingSignup(signup);
            setShowEditSignupModal(true);
          }}
          onDelete={handleDeleteSignup}
        />
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
          <SignupList
            signups={pastSignups}
            loading={false}
            isUpcoming={false}
            isLeagueAdmin={isLeagueAdmin}
            currentUserPlayer={currentUserPlayer}
            onSignup={handleSignup}
            onDropout={handleDropout}
            onEdit={(signup) => {
              setEditingSignup(signup);
              setShowEditSignupModal(true);
            }}
            onDelete={handleDeleteSignup}
          />
        </div>
      )}
      
      {/* Weekly Schedules Section (Admin only) */}
      {isLeagueAdmin && (
        <div className="league-schedules-section">
          <div className="league-section-header">
            <h3 className="league-section-title">
              <Calendar size={18} />
              Weekly Schedule
            </h3>
            <button className="league-text-button" onClick={() => setShowCreateScheduleModal(true)}>
              <Plus size={16} />
              Create Weekly Scheduled Session
            </button>
          </div>
          <ScheduleList
            schedules={weeklySchedules}
            isLeagueAdmin={isLeagueAdmin}
            onEdit={(schedule) => {
              setEditingSchedule(schedule);
              setShowEditScheduleModal(true);
            }}
            onDelete={handleDeleteSchedule}
          />
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

      <ConfirmationModal
        isOpen={showDeleteScheduleModal}
        onClose={() => {
          setShowDeleteScheduleModal(false);
          setScheduleToDelete(null);
        }}
        onConfirm={confirmDeleteSchedule}
        title="Delete Weekly Schedule"
        message="Are you sure you want to delete this weekly schedule? All future scheduled sessions for this schedule will be deleted. Past sessions will be preserved."
        confirmText="Delete Schedule"
        cancelText="Cancel"
      />
      
    </div>
  );
}

