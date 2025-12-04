import { useState, useEffect } from 'react';
import { updateUserProfile, updatePlayerProfile, getLocations } from '../../services/api';
import { AlertCircle, CheckCircle, Save } from 'lucide-react';

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

export default function ProfileTab({ user, currentUserPlayer, fetchCurrentUser }) {
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

  return (
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
  );
}

