import { useState, useEffect } from 'react';
import { X, AlertCircle, Info } from 'lucide-react';
import { updatePlayerProfile, getLocations } from '../../services/api';
import { Tooltip } from '../ui/UI';

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

const defaultFormState = {
  nickname: '',
  gender: '',
  level: '',
  date_of_birth: '',
  location_id: '',
};

const getErrorMessage = (error) => error.response?.data?.detail || error.message || 'Something went wrong';

export default function PlayerProfileModal({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState(defaultFormState);
  const [locations, setLocations] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setFormData(defaultFormState);
      setErrorMessage('');
      loadLocations();
    }
  }, [isOpen]);

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

  const loadLocations = async () => {
    setIsLoadingLocations(true);
    try {
      const locationsData = await getLocations();
      setLocations(locationsData || []);
    } catch (error) {
      console.error('Error loading locations:', error);
      // Don't show error, just continue without locations
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setErrorMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');

    // Validate required fields
    if (!formData.gender) {
      setErrorMessage('Gender is required');
      return;
    }

    if (!formData.level) {
      setErrorMessage('Skill level is required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare payload - gender and level are required
      const payload = {
        gender: formData.gender,
        level: formData.level,
      };

      if (formData.nickname && formData.nickname.trim()) {
        payload.nickname = formData.nickname.trim();
      }

      if (formData.date_of_birth) {
        payload.date_of_birth = formData.date_of_birth;
      }

      if (formData.location_id) {
        payload.default_location_id = parseInt(formData.location_id, 10);
      }

      await updatePlayerProfile(payload);
      
      // Call onSuccess callback if provided (this will refresh player data)
      if (onSuccess) {
        await onSuccess();
      }
      
      // Close modal
      onClose?.();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData(defaultFormState);
    setErrorMessage('');
    onClose?.();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <div className="auth-modal__header">
          <div>
            <h2>Complete Your Profile</h2>
          </div>
          <button className="auth-modal__close" onClick={handleClose} aria-label="Close profile modal">
            <X size={20} />
          </button>
        </div>

        <p className="auth-modal__description">
          Please complete your player profile. Gender and skill level are required.
        </p>

        {errorMessage && (
          <div className="auth-modal__alert error">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form className="auth-modal__form" onSubmit={handleSubmit}>
          <label className="auth-modal__label">
            <span>
              Gender <span className="required-asterisk">*</span>
              <Tooltip 
                text='Gender selection is required for gendered divisions (Mens/Womens). If you choose "prefer not to say", you will only be eligible for coed divisions.'
                multiline={true}
              >
                <Info size={16} className="info-icon" />
              </Tooltip>
            </span>
            <select
              name="gender"
              className="auth-modal__input"
              value={formData.gender}
              onChange={handleInputChange}
              required
            >
              <option value="">Select gender</option>
              {GENDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="auth-modal__label">
            <span>Skill Level <span className="required-asterisk">*</span></span>
            <select
              name="level"
              className="auth-modal__input"
              value={formData.level}
              onChange={handleInputChange}
              required
            >
              <option value="">Select skill level</option>
              {SKILL_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="auth-modal__label">
            Nickname
            <input
              type="text"
              name="nickname"
              className="auth-modal__input"
              placeholder="Optional"
              value={formData.nickname}
              onChange={handleInputChange}
            />
          </label>

          <label className="auth-modal__label">
            Date of Birth
            <input
              type="date"
              name="date_of_birth"
              className="auth-modal__input"
              value={formData.date_of_birth}
              onChange={handleInputChange}
            />
          </label>

          <label className="auth-modal__label">
            Location
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

          <button type="submit" className="auth-modal__submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
