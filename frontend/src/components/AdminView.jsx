import { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { getAdminConfig, updateAdminConfig } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useAuthModal } from '../contexts/AuthModalContext';
import { getUserLeagues } from '../services/api';
import { navigateTo } from '../Router';
import NavBar from './layout/NavBar';
import '../App.css';

function AdminView() {
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [userLeagues, setUserLeagues] = useState([]);
  
  // Form state
  const [enableSms, setEnableSms] = useState(false);
  const [enableEmail, setEnableEmail] = useState(false);
  const [logLevel, setLogLevel] = useState(null);
  
  // Track original values to detect changes
  const [originalValues, setOriginalValues] = useState({
    enable_sms: false,
    enable_email: false,
    log_level: 'INFO'
  });
  
  // Check if any values have changed (must be before any conditional returns)
  const hasChanges = useMemo(() => {
    if (!config) return false;
    return (
      enableSms !== originalValues.enable_sms ||
      enableEmail !== originalValues.enable_email ||
      (logLevel || 'INFO') !== originalValues.log_level
    );
  }, [enableSms, enableEmail, logLevel, originalValues, config]);
  
  // Load configuration on mount
  useEffect(() => {
    loadConfig();
  }, []);

  // Load user leagues for navbar
  useEffect(() => {
    const loadLeagues = async () => {
      if (isAuthenticated) {
        try {
          const leagues = await getUserLeagues();
          setUserLeagues(leagues);
        } catch (error) {
          console.error('Error loading user leagues:', error);
          setUserLeagues([]);
        }
      }
    };
    loadLeagues();
  }, [isAuthenticated]);

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      navigateTo('/');
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'view-league' && leagueId) {
      navigateTo(`/league/${leagueId}`);
    }
  };
  
  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminConfig();
      setConfig(data);
      setEnableSms(data.enable_sms);
      setEnableEmail(data.enable_email);
      setLogLevel(data.log_level || 'INFO');
      // Store original values to detect changes
      setOriginalValues({
        enable_sms: data.enable_sms,
        enable_email: data.enable_email,
        log_level: data.log_level || 'INFO'
      });
    } catch (err) {
      console.error('Error loading admin config:', err);
      if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to access this page.');
      } else if (err.response?.status === 401) {
        setError('Please log in to access this page.');
      } else {
        setError('Failed to load configuration. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      
      const updatedConfig = await updateAdminConfig({
        enable_sms: enableSms,
        enable_email: enableEmail,
        log_level: logLevel
      });
      
      setConfig(updatedConfig);
      setEnableSms(updatedConfig.enable_sms);
      setEnableEmail(updatedConfig.enable_email);
      setLogLevel(updatedConfig.log_level || 'INFO');
      // Update original values after successful save
      setOriginalValues({
        enable_sms: updatedConfig.enable_sms,
        enable_email: updatedConfig.enable_email,
        log_level: updatedConfig.log_level || 'INFO'
      });
      setSuccessMessage('Configuration updated successfully!');
      
      // Clear success message after 5 seconds (longer since it has important info)
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (err) {
      console.error('Error updating admin config:', err);
      if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to update settings.');
      } else if (err.response?.status === 401) {
        setError('Please log in to update settings.');
      } else if (err.response?.status === 400) {
        setError(err.response.data?.detail || 'Invalid input. Please check your values.');
      } else {
        setError('Failed to update configuration. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <>
        <NavBar
          isLoggedIn={isAuthenticated}
          user={user}
          currentUserPlayer={currentUserPlayer}
          userLeagues={userLeagues}
          onSignOut={handleSignOut}
          onSignIn={() => openAuthModal('sign-in')}
          onSignUp={() => openAuthModal('sign-up')}
          onLeaguesMenuClick={handleLeaguesMenuClick}
        />
        <div className="container">
          <div className="admin-view-container">
            <h1>Admin Configuration</h1>
            <p>Loading...</p>
          </div>
        </div>
      </>
    );
  }
  
  if (error && !config) {
    return (
      <>
        <NavBar
          isLoggedIn={isAuthenticated}
          user={user}
          currentUserPlayer={currentUserPlayer}
          userLeagues={userLeagues}
          onSignOut={handleSignOut}
          onSignIn={() => openAuthModal('sign-in')}
          onSignUp={() => openAuthModal('sign-up')}
          onLeaguesMenuClick={handleLeaguesMenuClick}
        />
        <div className="container">
          <div className="admin-view-container">
            <h1>Admin Configuration</h1>
            <div className="error-message">
              {error}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        userLeagues={userLeagues}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
        onLeaguesMenuClick={handleLeaguesMenuClick}
      />
      <div className="container">
        <div className="admin-view-container">
          <div className="admin-view-header">
            <h1>Admin Configuration</h1>
            <button
              onClick={loadConfig}
              disabled={loading || saving}
              className="admin-refresh-btn"
              aria-label="Refresh configuration"
              title="Refresh"
            >
              <RefreshCw size={20} className={loading ? 'spinning' : ''} />
            </button>
          </div>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        {successMessage && (
          <div className="success-message">
            {successMessage}
          </div>
        )}
        
        <div className="admin-settings">
          <div className="setting-group">
            <div className="setting-header">
              <label htmlFor="enable-sms" className="setting-label">
                SMS Enabled
              </label>
              <button
                type="button"
                className="toggle-wrapper"
                onClick={() => setEnableSms(!enableSms)}
                aria-label={enableSms ? 'Disable SMS' : 'Enable SMS'}
              >
                <span className={`toggle-switch ${enableSms ? 'active' : 'warning'}`} />
              </button>
            </div>
            <p className="setting-description">
              Control whether SMS verification codes are sent via Twilio
            </p>
          </div>
          
          <div className="setting-group">
            <div className="setting-header">
              <label htmlFor="enable-email" className="setting-label">
                Email Enabled
              </label>
              <button
                type="button"
                className="toggle-wrapper"
                onClick={() => setEnableEmail(!enableEmail)}
                aria-label={enableEmail ? 'Disable Email' : 'Enable Email'}
              >
                <span className={`toggle-switch ${enableEmail ? 'active' : 'warning'}`} />
              </button>
            </div>
            <p className="setting-description">
              Control whether email notifications are sent via SendGrid
            </p>
          </div>
          
          <div className="setting-group">
            <div className="setting-header">
              <label htmlFor="log-level" className="setting-label">
                Log Level
              </label>
              <select
                id="log-level"
                className="log-level-select"
                value={logLevel || 'INFO'}
                onChange={(e) => setLogLevel(e.target.value)}
              >
                <option value="DEBUG">DEBUG</option>
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="ERROR">ERROR</option>
              </select>
            </div>
            <p className="setting-description">
              Set the logging level.
            </p>
          </div>
        </div>
        
        <div className="admin-actions">
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        </div>
      </div>
    </>
  );
}

export default AdminView;
