import { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { updatePlayerProfile, getLocations } from '../../services/api';

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
  full_name: ' ',
  nickname: '',
  gender: 'male',
  level: 'beginner',
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

    // Validate full_name (should not be empty after trim)
    if (!formData.full_name || !formData.full_name.trim()) {
      setErrorMessage('Full name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare payload - only include non-empty optional fields
      const payload = {
        full_name: formData.full_name.trim(),
        gender: formData.gender,
        level: formData.level,
      };

      if (formData.nickname && formData.nickname.trim()) {
        payload.nickname = formData.nickname.trim();
      }

      if (formData.location_id) {
        payload.default_location_id = parseInt(formData.location_id, 10);
      }

      await updatePlayerProfile(payload);
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
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
          Please fill out your player profile information to get started.
        </p>

        {errorMessage && (
          <div className="auth-modal__alert error">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form className="auth-modal__form" onSubmit={handleSubmit}>
          <label className="auth-modal__label">
            <span>Full Name <span style={{ color: 'red' }}>*</span></span>
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
            Gender
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
            Skill Level
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

