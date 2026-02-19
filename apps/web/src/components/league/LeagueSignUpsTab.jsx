import { useState, useEffect, useMemo } from 'react';
import { Calendar, Plus } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
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

import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';

export default function LeagueSignUpsTab() {
  const { seasons, members, leagueId, isLeagueAdmin, isLeagueMember, selectedSeasonId } = useLeague();
  const { currentUserPlayer } = useAuth();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  
  const [signups, setSignups] = useState([]);
  const [weeklySchedules, setWeeklySchedules] = useState([]);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Load signups and schedules from all seasons or selected season
  useEffect(() => {
    if (seasons && seasons.length > 0) {
      loadSignups();
      loadWeeklySchedules();
    }
  }, [seasons, selectedSeasonId]);
  
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
    if (!seasons || seasons.length === 0) return;
    setLoading(true);
    try {
      // Load signups from all seasons or selected season
      const seasonsToLoad = selectedSeasonId 
        ? seasons.filter(s => s.id === selectedSeasonId)
        : seasons;
      
      const allSignups = [];
      for (const season of seasonsToLoad) {
        try {
          const data = await getSignups(season.id, { 
            upcoming_only: false,
            include_players: true 
          });
          if (Array.isArray(data)) {
            allSignups.push(...data);
          }
        } catch (err) {
          console.error(`Error loading signups for season ${season.id}:`, err);
          // Continue loading other seasons even if one fails
        }
      }
      
      // Sort by date (newest first)
      allSignups.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA;
      });
      
      setSignups(allSignups);
    } catch (err) {
      console.error('Error loading signups:', err);
      showToast('Failed to load signups', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const loadWeeklySchedules = async () => {
    if (!seasons || seasons.length === 0) return;
    try {
      // Load schedules from all seasons or selected season
      const seasonsToLoad = selectedSeasonId 
        ? seasons.filter(s => s.id === selectedSeasonId)
        : seasons;
      
      const allSchedules = [];
      for (const season of seasonsToLoad) {
        try {
          const data = await getWeeklySchedules(season.id);
          if (Array.isArray(data)) {
            allSchedules.push(...data);
          }
        } catch (err) {
          console.error(`Error loading schedules for season ${season.id}:`, err);
          // Continue loading other seasons even if one fails
        }
      }
      
      setWeeklySchedules(allSchedules);
    } catch (err) {
      console.error('Error loading weekly schedules:', err);
      showToast('Failed to load weekly schedules', 'error');
    }
  };
  
  const handleCreateSignup = async (signupData) => {
    // Use selectedSeasonId or first season if none selected
    const seasonId = selectedSeasonId || (seasons && seasons.length > 0 ? seasons[0].id : null);
    if (!seasonId) {
      showToast('Please select a season to create a signup', 'error');
      return;
    }
    try {
      await createSignup(seasonId, signupData);
      closeModal();
      await loadSignups();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to create signup', 'error');
      throw err;
    }
  };
  
  const handleUpdateSignup = async (signupId, signupData) => {
    try {
      await updateSignup(signupId, signupData);
      closeModal();
      await loadSignups();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update signup', 'error');
      throw err;
    }
  };
  
  const handleDeleteSignup = async (signupId) => {
    if (!confirm('Are you sure you want to delete this signup?')) return;
    try {
      await deleteSignup(signupId);
      await loadSignups();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to delete signup', 'error');
    }
  };
  
  const handleSignup = async (signupId) => {
    try {
      await signupForSignup(signupId);
      await loadSignups();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to sign up', 'error');
    }
  };
  
  const handleDropout = async (signupId) => {
    try {
      await dropoutFromSignup(signupId);
      await loadSignups();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to drop out', 'error');
    }
  };
  
  const handleCreateSchedule = async (scheduleData) => {
    // Use selectedSeasonId or first season if none selected
    const seasonId = selectedSeasonId || (seasons && seasons.length > 0 ? seasons[0].id : null);
    if (!seasonId) {
      showToast('Please select a season to create a schedule', 'error');
      return;
    }
    const season = seasons.find(s => s.id === seasonId);
    try {
      await createWeeklySchedule(seasonId, scheduleData);
      await loadWeeklySchedules();
      await loadSignups(); // Reload signups as new ones may have been generated
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to create weekly schedule', 'error');
      throw err;
    }
  };
  
  const handleUpdateSchedule = async (scheduleId, scheduleData) => {
    try {
      await updateWeeklySchedule(scheduleId, scheduleData);
      await loadWeeklySchedules();
      await loadSignups(); // Reload signups as they may have been regenerated
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update weekly schedule', 'error');
      throw err;
    }
  };
  
  const handleDeleteSchedule = (scheduleId) => {
    openModal(MODAL_TYPES.CONFIRMATION, {
      title: "Delete Weekly Schedule",
      message: "Are you sure you want to delete this weekly schedule? All future scheduled sessions for this schedule will be deleted. Past sessions will be preserved.",
      confirmText: "Delete Schedule",
      cancelText: "Cancel",
      onConfirm: () => confirmDeleteSchedule(scheduleId)
    });
  };

  const confirmDeleteSchedule = async (scheduleId) => {
    if (!scheduleId) return;
    try {
      await deleteWeeklySchedule(scheduleId);
      await loadWeeklySchedules();
      await loadSignups();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to delete weekly schedule', 'error');
    }
  };
  
  const upcomingSignups = signups.filter(s => !s.is_past);
  const pastSignups = signups.filter(s => s.is_past);
  
  // Get season for creating signups/schedules (use selectedSeasonId or first season)
  const seasonForCreation = selectedSeasonId 
    ? seasons.find(s => s.id === selectedSeasonId)
    : (seasons && seasons.length > 0 ? seasons[0] : null);
  
  return (
    <>
      {/* Upcoming Signups Section */}
      <div className="league-section">
        <div className="league-section-header">
          <h3 className="league-section-title">
            <Calendar size={18} />
            Upcoming Sessions
          </h3>
          {isLeagueMember && seasonForCreation && (
            <button className="league-text-button" onClick={() => openModal(MODAL_TYPES.SIGNUP, {
              seasonId: seasonForCreation.id,
              onSubmit: handleCreateSignup
            })}>
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
            // Use signup's season_id if available, otherwise use seasonForCreation
            const seasonId = signup.season_id || (seasonForCreation?.id);
            if (!seasonId) {
              showToast('Unable to determine season for this signup', 'error');
              return;
            }
            openModal(MODAL_TYPES.SIGNUP, {
              signup,
              seasonId: seasonId,
              onSubmit: (data) => handleUpdateSignup(signup.id, data)
            });
          }}
          onDelete={handleDeleteSignup}
        />
      </div>
      
      {/* Past Signups Section */}
      {pastSignups.length > 0 && (
        <div className="league-section">
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
              // Use signup's season_id if available, otherwise use seasonForCreation
              const seasonId = signup.season_id || (seasonForCreation?.id);
              if (!seasonId) {
                showToast('Unable to determine season for this signup', 'error');
                return;
              }
              openModal(MODAL_TYPES.SIGNUP, {
                signup,
                seasonId: seasonId,
                onSubmit: (data) => handleUpdateSignup(signup.id, data)
              });
            }}
            onDelete={handleDeleteSignup}
          />
        </div>
      )}
      
      {/* Weekly Schedules Section */}
      {isLeagueMember && (
        <div className="league-section">
          <div className="league-section-header">
            <h3 className="league-section-title">
              <Calendar size={18} />
              Weekly Schedule
            </h3>
            <button 
              className="league-text-button" 
              onClick={() => {
                if (!seasonForCreation) {
                  showToast('Please select a season to create a schedule', 'error');
                  return;
                }
                openModal(MODAL_TYPES.EDIT_SCHEDULE, {
                  seasonId: seasonForCreation.id,
                  onSubmit: handleCreateSchedule
                });
              }}
              disabled={!isLeagueAdmin || !seasonForCreation}
            >
              <Plus size={16} />
              Create Weekly Scheduled Session
            </button>
          </div>
          <ScheduleList
            schedules={weeklySchedules}
            isLeagueAdmin={isLeagueAdmin}
            onEdit={(schedule) => {
              openModal(MODAL_TYPES.EDIT_SCHEDULE, {
                schedule,
                onSubmit: (data) => handleUpdateSchedule(schedule.id, data)
              });
            }}
            onDelete={handleDeleteSchedule}
          />
        </div>
      )}
      
    </>
  );
}
