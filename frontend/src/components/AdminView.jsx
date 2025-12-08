'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { getAdminConfig, updateAdminConfig, getAdminFeedback, updateFeedbackResolution } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useAuthModal } from '../contexts/AuthModalContext';
import { getUserLeagues } from '../services/api';
import NavBar from './layout/NavBar';
import '../App.css';

function AdminView() {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [userLeagues, setUserLeagues] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [showUnresolvedOnly, setShowUnresolvedOnly] = useState(false);
  
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
    loadFeedback();
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
      router.push('/');
    }
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'view-league' && leagueId) {
      router.push(`/league/${leagueId}`);
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
  
  const loadFeedback = async () => {
    try {
      setFeedbackLoading(true);
      const data = await getAdminFeedback();
      setFeedback(data);
    } catch (err) {
      console.error('Error loading feedback:', err);
      // Don't show error for feedback loading, just log it
    } finally {
      setFeedbackLoading(false);
    }
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };
  
  const handleToggleResolved = async (feedbackId, currentStatus) => {
    try {
      const newStatus = !currentStatus;
      const updated = await updateFeedbackResolution(feedbackId, newStatus);
      
      // Update the feedback in the local state
      setFeedback(prev => prev.map(item => 
        item.id === feedbackId ? updated : item
      ));
    } catch (err) {
      console.error('Error updating feedback resolution:', err);
      // Optionally show an error message to the user
    }
  };
  
  // Filter feedback based on search and unresolved filter
  const filteredFeedback = useMemo(() => {
    return feedback.filter(item => {
      // Filter by unresolved only if enabled
      if (showUnresolvedOnly && item.is_resolved) {
        return false;
      }
      
      // Filter by search term
      if (feedbackSearch.trim()) {
        const searchLower = feedbackSearch.toLowerCase();
        const matchesSearch = 
          item.feedback_text.toLowerCase().includes(searchLower) ||
          (item.user_name && item.user_name.toLowerCase().includes(searchLower)) ||
          (item.email && item.email.toLowerCase().includes(searchLower)) ||
          item.id.toString().includes(searchLower);
        
        if (!matchesSearch) {
          return false;
        }
      }
      
      return true;
    });
  }, [feedback, feedbackSearch, showUnresolvedOnly]);
  
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
        
        <div className="admin-feedback-section">
          <div className="admin-section-header">
            <h2>Feedback</h2>
            <button
              onClick={loadFeedback}
              disabled={feedbackLoading}
              className="admin-refresh-btn"
              aria-label="Refresh feedback"
              title="Refresh feedback"
            >
              <RefreshCw size={18} className={feedbackLoading ? 'spinning' : ''} />
            </button>
          </div>
          
          {/* Filter Panel */}
          <div className="admin-feedback-filters">
            <div className="feedback-filter-group">
              <input
                type="text"
                placeholder="Search feedback, user, email, or ID..."
                value={feedbackSearch}
                onChange={(e) => setFeedbackSearch(e.target.value)}
                className="feedback-search-input"
              />
            </div>
            <div className="feedback-filter-group">
              <label className="feedback-filter-checkbox">
                <input
                  type="checkbox"
                  checked={showUnresolvedOnly}
                  onChange={(e) => setShowUnresolvedOnly(e.target.checked)}
                />
                <span>Show unresolved only</span>
              </label>
            </div>
          </div>
          
          {feedbackLoading ? (
            <p>Loading feedback...</p>
          ) : feedback.length === 0 ? (
            <p>No feedback submitted yet.</p>
          ) : filteredFeedback.length === 0 ? (
            <p>No feedback matches your filters.</p>
          ) : (
            <div className="admin-feedback-table-container">
              <table className="admin-feedback-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Date</th>
                    <th>User</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Resolved</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeedback.map((item) => (
                    <tr key={item.id} className={item.is_resolved ? 'resolved' : ''}>
                      <td>{item.id}</td>
                      <td>{formatDate(item.created_at)}</td>
                      <td>{item.user_name || (item.user_id ? `User ${item.user_id}` : 'Anonymous')}</td>
                      <td>{item.email || 'N/A'}</td>
                      <td>
                        <span className={`feedback-status ${item.is_resolved ? 'resolved' : 'pending'}`}>
                          {item.is_resolved ? 'Resolved' : 'Pending'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="feedback-resolve-toggle"
                          onClick={() => handleToggleResolved(item.id, item.is_resolved)}
                          aria-label={item.is_resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                          title={item.is_resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                        >
                          <span className={`toggle-switch ${item.is_resolved ? 'active' : ''}`} />
                        </button>
                      </td>
                      <td className="feedback-text-cell">
                        <div className="feedback-text">{item.feedback_text}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}

export default AdminView;
