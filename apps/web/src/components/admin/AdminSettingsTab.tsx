'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getAdminConfig, updateAdminConfig } from '../../services/api';

interface AdminConfig {
  enable_sms: boolean;
  enable_email: boolean;
  log_level: string;
}

/**
 * Admin settings tab — SMS/email toggles and log level.
 */
export default function AdminSettingsTab() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [enableSms, setEnableSms] = useState(false);
  const [enableEmail, setEnableEmail] = useState(false);
  const [logLevel, setLogLevel] = useState<string | null>(null);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up success message timer on unmount
  useEffect(() => () => clearTimeout(successTimerRef.current ?? undefined), []);

  const [originalValues, setOriginalValues] = useState({
    enable_sms: false,
    enable_email: false,
    log_level: 'INFO',
  });

  const hasChanges = useMemo(() => {
    if (!config) return false;
    return (
      enableSms !== originalValues.enable_sms ||
      enableEmail !== originalValues.enable_email ||
      (logLevel || 'INFO') !== originalValues.log_level
    );
  }, [enableSms, enableEmail, logLevel, originalValues, config]);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminConfig();
      setConfig(data);
      setEnableSms(data.enable_sms);
      setEnableEmail(data.enable_email);
      setLogLevel(data.log_level || 'INFO');
      setOriginalValues({
        enable_sms: data.enable_sms,
        enable_email: data.enable_email,
        log_level: data.log_level || 'INFO',
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
        log_level: logLevel,
      });

      setConfig(updatedConfig);
      setEnableSms(updatedConfig.enable_sms);
      setEnableEmail(updatedConfig.enable_email);
      setLogLevel(updatedConfig.log_level || 'INFO');
      setOriginalValues({
        enable_sms: updatedConfig.enable_sms,
        enable_email: updatedConfig.enable_email,
        log_level: updatedConfig.log_level || 'INFO',
      });
      setSuccessMessage('Configuration updated successfully!');
      clearTimeout(successTimerRef.current ?? undefined);
      successTimerRef.current = setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error updating admin config:', err);
      if (err.response?.status === 403) {
        setError('Access denied.');
      } else if (err.response?.status === 400) {
        setError(err.response.data?.detail || 'Invalid input.');
      } else {
        setError('Failed to update configuration. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading settings...</p>;

  return (
    <>
      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      <div className="admin-settings">
        <div className="setting-group">
          <div className="setting-header">
            <label className="setting-label">SMS Enabled</label>
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
            <label className="setting-label">Email Enabled</label>
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
            <label htmlFor="log-level" className="setting-label">Log Level</label>
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
          <p className="setting-description">Set the logging level.</p>
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
    </>
  );
}
