import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/UI';
import { useAuth } from '../../contexts/AuthContext';

const INITIAL_FORM_STATE = {
  name: '',
  description: '',
  is_open: true,
  gender: 'male', // Default to Men's
  level: ''
};

// Gender options - Mixed is disabled as it's not supported yet
const GENDER_OPTIONS = [
  { value: 'male', label: "Men's" },
  { value: 'female', label: "Women's" },
  { value: 'mixed', label: 'Mixed', disabled: true }
];

const LEVEL_OPTIONS = [
  { value: '', label: 'Select skill level' },
  { value: 'juniors', label: 'Juniors' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'Open', label: 'Open' }
];

export default function CreateLeagueModal({ isOpen, onClose, onSubmit }) {
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const { isAuthenticated, currentUserPlayer } = useAuth();

  // Load current user's player data and reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset form first
      setFormData(INITIAL_FORM_STATE);
      setFormError(null);
      
      // Then use user's player data from context to set defaults
      if (isAuthenticated && currentUserPlayer) {
        // Normalize player level to match LEVEL_OPTIONS (case-insensitive)
        let normalizedLevel = '';
        if (currentUserPlayer.level) {
          const playerLevelLower = currentUserPlayer.level.toLowerCase();
          // Find matching option (case-insensitive)
          const matchingOption = LEVEL_OPTIONS.find(opt => 
            opt.value && opt.value.toLowerCase() === playerLevelLower
          );
          normalizedLevel = matchingOption ? matchingOption.value : currentUserPlayer.level;
        }
        
        setFormData(prev => ({
          ...prev,
          gender: currentUserPlayer.gender || 'male', // Default to Men's if not known
          level: normalizedLevel || '' // Default to player's level if it matches an option
        }));
      }
    }
  }, [isOpen, isAuthenticated, currentUserPlayer]);

  // Add modal-open class to body when modal is open (for iOS z-index fix)
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    
    // Cleanup on unmount
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (formError) setFormError(null);
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    
    // Validate required fields
    if (!formData.name.trim()) {
      setFormError('League name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare payload - only include non-empty optional fields
      const payload = {
        name: formData.name.trim(),
        is_open: formData.is_open
      };

      if (formData.description.trim()) {
        payload.description = formData.description.trim();
      }

      if (formData.gender) {
        payload.gender = formData.gender;
      }

      if (formData.level) {
        payload.level = formData.level;
      }

      await onSubmit(payload);
      
      // Reset form and close
      setFormData(INITIAL_FORM_STATE);
      onClose();
    } catch (error) {
      console.error('Error creating league:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create league. Please try again.';
      setFormError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create League</h2>
          <Button variant="close" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="create-league-form">
          {formError && (
            <div className="form-error">
              {formError}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="league-name">
              League Name <span className="required">*</span>
            </label>
            <input
              id="league-name"
              type="text"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="Central Park Weekday AA Men's"
              className="form-input"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="league-description">Description</label>
            <textarea
              id="league-description"
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Optional description of the league"
              className="form-input"
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label className="form-group-label">
              League Access <span className="required">*</span>
            </label>
            <div className="radio-card-group radio-card-group-2">
              <label 
                className={`radio-card ${formData.is_open ? 'selected' : ''}`}
                htmlFor="league-open"
              >
                <div className="radio-card-header">
                  <input
                    type="radio"
                    id="league-open"
                    name="league-access"
                    value="open"
                    checked={formData.is_open}
                    onChange={() => handleFieldChange('is_open', true)}
                    disabled={isSubmitting}
                  />
                  <span className="radio-card-title">Open League</span>
                </div>
                <p className="radio-card-description">
                  Anyone with the same skill level and gender can join freely
                </p>
              </label>

              <label 
                className={`radio-card ${formData.is_open ? '' : 'selected'}`}
                htmlFor="league-invite-only"
              >
                <div className="radio-card-header">
                  <input
                    type="radio"
                    id="league-invite-only"
                    name="league-access"
                    value="invite-only"
                    checked={!formData.is_open}
                    onChange={() => handleFieldChange('is_open', false)}
                    disabled={isSubmitting}
                  />
                  <span className="radio-card-title">Invite Only</span>
                </div>
                <p className="radio-card-description">
                  New members must be invited or approved by a league admin
                </p>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-group-label">Gender</label>
            <div className="radio-card-group radio-card-group-3">
              {GENDER_OPTIONS.map(option => (
                <label
                  key={option.value}
                  className={`radio-card ${formData.gender === option.value ? 'selected' : ''} ${option.disabled ? 'disabled' : ''}`}
                  htmlFor={`league-gender-${option.value}`}
                >
                  <div className="radio-card-header">
                    <input
                      type="radio"
                      id={`league-gender-${option.value}`}
                      name="league-gender"
                      value={option.value}
                      checked={formData.gender === option.value}
                      onChange={() => !option.disabled && handleFieldChange('gender', option.value)}
                      disabled={isSubmitting || option.disabled}
                    />
                    <span className="radio-card-title">{option.label}</span>
                  </div>
                </label>
              ))}
            </div>
            <small className="form-help-text">
              Mixed gender leagues are not supported at this time
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="league-level">Skill Level</label>
            <select
              id="league-level"
              value={formData.level}
              onChange={(e) => handleFieldChange('level', e.target.value)}
              className="form-input form-select"
              disabled={isSubmitting}
            >
              {LEVEL_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </form>
        <div className="modal-actions">
          <Button type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" variant="success" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create League'}
          </Button>
        </div>
      </div>
    </div>
  );
}

