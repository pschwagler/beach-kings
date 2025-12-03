import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { updateUserProfile, updatePlayerProfile, getLocations, getUserLeagues, leaveLeague } from '../../services/api';
import { navigateTo } from '../../Router';
import { AlertCircle, CheckCircle, User, Users, PanelRightClose, PanelRightOpen, Save, Trophy, ChevronRight } from 'lucide-react';
import NavBar from '../layout/NavBar';
import ConfirmationModal from '../modal/ConfirmationModal';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const SKILL_LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'AA', label: 'AA' },
  { value: 'Open', label: 'Open' },
];

const PREFERRED_SIDE_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const getErrorMessage = (error) => error.response?.data?.detail || error.message || 'Something went wrong';

export default function ProfilePage() {
  const { user, currentUserPlayer, isAuthenticated, fetchCurrentUser, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [activeTab, setActiveTab] = useState('profile');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });
  const [userLeagues, setUserLeagues] = useState([]);
  
  // Consolidated Form Data
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    nickname: '',
    gender: 'male',
    level: 'beginner',
    date_of_birth: '',
    height: '',
    preferred_side: '',
    location_id: '',
  });

  const [locations, setLocations] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [showLeaveLeagueModal, setShowLeaveLeagueModal] = useState(false);
  const [leagueToLeave, setLeagueToLeave] = useState(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigateTo('/');
    }
  }, [isAuthenticated]);

  // Load initial data
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        email: user.email || '',
      }));
    }
  }, [user]);

  useEffect(() => {
    if (currentUserPlayer) {
      setFormData(prev => ({
        ...prev,
        full_name: currentUserPlayer.full_name || '',
        nickname: currentUserPlayer.nickname || '',
        gender: currentUserPlayer.gender || 'male',
        level: currentUserPlayer.level || 'beginner',
        date_of_birth: currentUserPlayer.date_of_birth || '',
        height: currentUserPlayer.height || '',
        preferred_side: currentUserPlayer.preferred_side || '',
        location_id: currentUserPlayer.default_location_id || '',
      }));
    }
  }, [currentUserPlayer]);

  useEffect(() => {
    loadLocations();
    loadUserLeagues();
  }, [isAuthenticated]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setSidebarCollapsed(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadLocations = async () => {
    setIsLoadingLocations(true);
    try {
      const locationsData = await getLocations();
      setLocations(locationsData || []);
    } catch (error) {
      console.error('Error loading locations:', error);
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const loadUserLeagues = async () => {
    if (isAuthenticated) {
      try {
        const leagues = await getUserLeagues();
        setUserLeagues(leagues);
      } catch (err) {
        console.error('Error loading user leagues:', err);
      }
    }
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    // Validate full_name
    if (!formData.full_name || !formData.full_name.trim()) {
      setErrorMessage('Full name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Update User Profile (Email)
      if (formData.email !== (user?.email || '')) {
        await updateUserProfile({ email: formData.email.trim() || null });
      }

      // 2. Update Player Profile
      const playerPayload = {
        full_name: formData.full_name.trim(),
        gender: formData.gender,
        level: formData.level,
      };

      if (formData.nickname && formData.nickname.trim()) {
        playerPayload.nickname = formData.nickname.trim();
      }

      if (formData.date_of_birth && formData.date_of_birth.trim()) {
        playerPayload.date_of_birth = formData.date_of_birth.trim();
      }

      if (formData.height && formData.height.trim()) {
        playerPayload.height = formData.height.trim();
      }

      if (formData.preferred_side && formData.preferred_side.trim()) {
        playerPayload.preferred_side = formData.preferred_side.trim();
      }

      if (formData.location_id) {
        playerPayload.default_location_id = parseInt(formData.location_id, 10);
      }

      await updatePlayerProfile(playerPayload);
      
      // Refresh user data
      if (fetchCurrentUser) {
        await fetchCurrentUser();
      }
      
      setSuccessMessage('Profile updated successfully');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      navigateTo('/');
    }
  };

  const handleLeaveLeague = (e, leagueId, leagueName) => {
    e.stopPropagation();
    setLeagueToLeave({ id: leagueId, name: leagueName });
    setShowLeaveLeagueModal(true);
  };

  const confirmLeaveLeague = async () => {
    if (!leagueToLeave) return;
    
    try {
      await leaveLeague(leagueToLeave.id);
      setSuccessMessage(`Successfully left ${leagueToLeave.name}`);
      setShowLeaveLeagueModal(false);
      setLeagueToLeave(null);
      // Refresh leagues list
      loadUserLeagues();
      // Also refresh navbar leagues by reloading page or triggering an update (optional, but good for consistency)
      // For now, loadUserLeagues updates the local state which is enough for this page.
      // To update Navbar, we might need to trigger a global update or just rely on navigation.
      if (fetchCurrentUser) {
        await fetchCurrentUser(); // This might help if user object has league info
      }
    } catch (error) {
      console.error('Error leaving league:', error);
      setErrorMessage(getErrorMessage(error));
      setShowLeaveLeagueModal(false);
      setLeagueToLeave(null);
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'view-league' && leagueId) {
      window.history.pushState({}, '', `/league/${leagueId}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
      />
      <div className="league-dashboard-container">
        <div className="league-dashboard">
          {/* Left Sidebar Navigation */}
          <aside className={`league-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
            <div className="league-sidebar-header">
              <div className="league-sidebar-title-wrapper-container">
                <div className="league-sidebar-title-wrapper no-pointer">
                  <h1 className="league-sidebar-title">Account</h1>
                </div>
              </div>
              <button
                className="league-sidebar-collapse-btn"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              </button>
            </div>
            
            <nav className="league-sidebar-nav">
              <button
                className={`league-sidebar-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('profile');
                  if (window.innerWidth <= 768) setSidebarCollapsed(true);
                }}
                title="Profile"
              >
                <User size={20} />
                <span>Profile</span>
              </button>
              <button
                className={`league-sidebar-nav-item ${activeTab === 'leagues' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('leagues');
                  if (window.innerWidth <= 768) setSidebarCollapsed(true);
                }}
                title="My Leagues"
              >
                <Trophy size={20} />
                <span>My Leagues</span>
              </button>
              <button
                className={`league-sidebar-nav-item ${activeTab === 'friends' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('friends');
                  if (window.innerWidth <= 768) setSidebarCollapsed(true);
                }}
                title="Friends"
              >
                <Users size={20} />
                <span>Friends</span>
              </button>
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="league-content">
            <div className="league-content-header">
              <div className="league-content-header-title">
                <h1 className="league-content-header-text">
                  {activeTab === 'profile' ? 'Profile' : activeTab === 'friends' ? 'Friends' : 'My Leagues'}
                </h1>
              </div>
            </div>

            <div className="profile-page-content">
              {activeTab === 'profile' && (
              <div className="profile-page__section league-section">
                {errorMessage && (
                  <div className="auth-modal__alert error">
                    <AlertCircle size={18} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="auth-modal__alert success">
                    <CheckCircle size={18} />
                    <span>{successMessage}</span>
                  </div>
                )}

                <form className="profile-page__form" onSubmit={handleSubmit}>
                  {/* Account Info */}
                  <h3 className="profile-page__section-title section-title-first">Account Information</h3>
                  
                  <label className="auth-modal__label">
                    <span>Phone Number</span>
                    <input
                      type="text"
                      className="auth-modal__input disabled-input"
                      value={user?.phone_number || ''}
                      disabled
                      readOnly
                    />
                    <small className="profile-page__help-text">Please contact us to change your phone number</small>
                  </label>

                  <label className="auth-modal__label">
                    <span>Email</span>
                    <input
                      type="email"
                      name="email"
                      className="auth-modal__input"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </label>

                  {/* Player Info */}
                  <h3 className="profile-page__section-title section-title-spaced">Player Profile</h3>

                  <label className="auth-modal__label">
                    <span>Full Name <span className="required-asterisk">*</span></span>
                    <input
                      type="text"
                      name="full_name"
                      className="auth-modal__input"
                      placeholder="Enter your full name"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      required
                    />
                  </label>

                  <label className="auth-modal__label">
                    <span>Nickname</span>
                    <input
                      type="text"
                      name="nickname"
                      className="auth-modal__input"
                      placeholder="Optional"
                      value={formData.nickname}
                      onChange={handleInputChange}
                    />
                  </label>

                  <div className="profile-page__form-row">
                    <label className="auth-modal__label">
                      <span>Gender</span>
                      <select
                        name="gender"
                        className="auth-modal__input"
                        value={formData.gender}
                        onChange={handleInputChange}
                        required
                      >
                        {GENDER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="auth-modal__label">
                      <span>Skill Level</span>
                      <select
                        name="level"
                        className="auth-modal__input"
                        value={formData.level}
                        onChange={handleInputChange}
                        required
                      >
                        {SKILL_LEVEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="profile-page__form-row">
                    <label className="auth-modal__label">
                      <span>Date of Birth</span>
                      <input
                        type="date"
                        name="date_of_birth"
                        className="auth-modal__input"
                        value={formData.date_of_birth}
                        onChange={handleInputChange}
                      />
                    </label>

                    <label className="auth-modal__label">
                      <span>Height</span>
                      <input
                        type="text"
                        name="height"
                        className="auth-modal__input"
                        placeholder="e.g., 6'2&quot;"
                        value={formData.height}
                        onChange={handleInputChange}
                      />
                    </label>
                  </div>

                  <label className="auth-modal__label">
                    <span>Preferred Side</span>
                    <select
                      name="preferred_side"
                      className="auth-modal__input"
                      value={formData.preferred_side}
                      onChange={handleInputChange}
                    >
                      <option value="">Select preferred side (optional)</option>
                      {PREFERRED_SIDE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="auth-modal__label">
                    <span>Default Location</span>
                    <select
                      name="location_id"
                      className="auth-modal__input"
                      value={formData.location_id}
                      onChange={handleInputChange}
                      disabled={isLoadingLocations}
                    >
                      <option value="">Select a location (optional)</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="form-actions">
                    <button 
                      type="submit" 
                      className="auth-modal__submit save-button" 
                      disabled={isSubmitting}
                    >
                      <Save size={18} />
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === 'friends' && (
              <div className="profile-page__section league-section coming-soon-section">
                <Users size={48} className="coming-soon-icon" />
                <h3>Friends list coming soon...</h3>
                <p>Stay tuned for updates!</p>
              </div>
            )}

            {activeTab === 'leagues' && (
              <div className="profile-page__section league-section">
                {errorMessage && (
                  <div className="auth-modal__alert error">
                    <AlertCircle size={18} />
                    <span>{errorMessage}</span>
                  </div>
                )}
                {successMessage && (
                  <div className="auth-modal__alert success">
                    <CheckCircle size={18} />
                    <span>{successMessage}</span>
                  </div>
                )}
                
                {userLeagues.length === 0 ? (
                  <div className="coming-soon-section">
                    <Trophy size={48} className="coming-soon-icon" />
                    <h3>No leagues found</h3>
                    <p>You haven't joined any leagues yet.</p>
                  </div>
                ) : (
                  <div className="leagues-list">
                    {userLeagues.map(league => (
                      <div 
                        key={league.id} 
                        className="league-card" 
                        onClick={() => handleLeaguesMenuClick('view-league', league.id)}
                      >
                        <div className="league-card-content">
                          <h3 className="league-card-title">{league.name}</h3>
                          <div className="league-card-meta">
                            <span className="league-card-badge">
                              {league.location_name || 'No location'}
                            </span>
                            <span className="league-card-members">
                              <Users size={14} />
                              {league.member_count || 0} members
                            </span>
                          </div>
                        </div>
                        
                        <div className="league-card-actions">
                          <button
                            onClick={(e) => handleLeaveLeague(e, league.id, league.name)}
                            className="league-leave-button"
                          >
                            Leave
                          </button>
                          
                          <ChevronRight size={20} className="league-card-chevron" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          </main>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showLeaveLeagueModal}
        onClose={() => {
          setShowLeaveLeagueModal(false);
          setLeagueToLeave(null);
        }}
        onConfirm={confirmLeaveLeague}
        title="Leave League"
        message={leagueToLeave ? `Are you sure you want to leave ${leagueToLeave.name}?` : ''}
        confirmText="Leave League"
        cancelText="Cancel"
      />
    </>
  );
}

