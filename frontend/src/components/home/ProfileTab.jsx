import { useState, useEffect, useRef } from 'react';
import { updateUserProfile, updatePlayerProfile, getLocations } from '../../services/api';
import { AlertCircle, CheckCircle, Save } from 'lucide-react';
import { useLocationAutoSelect } from '../../hooks/useLocationAutoSelect';
import PlayerProfileFields from '../player/PlayerProfileFields';

const PREFERRED_SIDE_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'none', label: 'No Preference' },
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
    preferred_side: 'none',
    city: '',
    state: '',
    city_latitude: null,
    city_longitude: null,
    location_id: '',
    distance_to_location: null,
  });

  const [initialFormData, setInitialFormData] = useState({
    email: '',
    full_name: '',
    nickname: '',
    gender: 'male',
    level: 'beginner',
    date_of_birth: '',
    height: '',
    preferred_side: 'none',
    city: '',
    state: '',
    city_latitude: null,
    city_longitude: null,
    location_id: '',
    distance_to_location: null,
  });

  const [allLocations, setAllLocations] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showCheckmark, setShowCheckmark] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  const {
    locations,
    handleCitySelect: handleCitySelectWithLocation,
    handleLocationChange,
    updateLocationsWithDistances,
  } = useLocationAutoSelect(setFormData, setErrorMessage);

  // Load initial data
  useEffect(() => {
    if (user) {
      const email = user.email || '';
      setFormData(prev => ({
        ...prev,
        email,
      }));
      setInitialFormData(prev => ({
        ...prev,
        email,
      }));
    }
  }, [user]);

  useEffect(() => {
    if (currentUserPlayer) {
      // Format city display value
      const cityDisplay = currentUserPlayer.city 
        ? (currentUserPlayer.state ? `${currentUserPlayer.city}, ${currentUserPlayer.state}` : currentUserPlayer.city)
        : '';
      
      const newFormData = {
        full_name: currentUserPlayer.full_name || '',
        nickname: currentUserPlayer.nickname || '',
        gender: currentUserPlayer.gender || 'male',
        level: currentUserPlayer.level || 'beginner',
        date_of_birth: currentUserPlayer.date_of_birth || '',
        height: currentUserPlayer.height || '',
        preferred_side: currentUserPlayer.preferred_side || 'none',
        city: cityDisplay,
        state: currentUserPlayer.state || '',
        city_latitude: currentUserPlayer.city_latitude || null,
        city_longitude: currentUserPlayer.city_longitude || null,
        location_id: currentUserPlayer.default_location_id ? String(currentUserPlayer.default_location_id) : '',
        distance_to_location: currentUserPlayer.distance_to_location || null,
      };
      setFormData(prev => ({
        ...prev,
        ...newFormData,
      }));
      setInitialFormData(prev => ({
        ...prev,
        ...newFormData,
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
      setAllLocations(locationsData || []);
      updateLocationsWithDistances(locationsData || []);
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
    setShowCheckmark(false);
  };

  // Check if form has changes
  const hasChanges = () => {
    return (
      formData.email !== initialFormData.email ||
      formData.full_name !== initialFormData.full_name ||
      formData.nickname !== initialFormData.nickname ||
      formData.gender !== initialFormData.gender ||
      formData.level !== initialFormData.level ||
      formData.date_of_birth !== initialFormData.date_of_birth ||
      formData.height !== initialFormData.height ||
      formData.preferred_side !== initialFormData.preferred_side ||
      formData.city !== initialFormData.city ||
      formData.state !== initialFormData.state ||
      formData.city_latitude !== initialFormData.city_latitude ||
      formData.city_longitude !== initialFormData.city_longitude ||
      String(formData.location_id || '') !== String(initialFormData.location_id || '') ||
      formData.distance_to_location !== initialFormData.distance_to_location
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setShowCheckmark(false);

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
        const preferredSide = formData.preferred_side.trim();
        // Send null if "none" is selected, otherwise send the value
        playerPayload.preferred_side = preferredSide === 'none' ? null : preferredSide;
      }

      if (formData.city) {
        playerPayload.city = formData.city;
      }

      if (formData.state) {
        playerPayload.state = formData.state;
      }

      if (formData.city_latitude !== null && formData.city_latitude !== undefined) {
        playerPayload.city_latitude = formData.city_latitude;
      }

      if (formData.city_longitude !== null && formData.city_longitude !== undefined) {
        playerPayload.city_longitude = formData.city_longitude;
      }

      if (formData.location_id) {
        playerPayload.location_id = parseInt(formData.location_id, 10);
      }

      if (formData.distance_to_location !== null && formData.distance_to_location !== undefined) {
        playerPayload.distance_to_location = formData.distance_to_location;
      }

      await updatePlayerProfile(playerPayload);
      
      // Refresh user data
      if (fetchCurrentUser) {
        await fetchCurrentUser();
      }
      
      // Update initial form data to reflect saved state
      setInitialFormData({ ...formData });
      
      // Show checkmark animation
      setShowCheckmark(true);
      setTimeout(() => setShowCheckmark(false), 2000);
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

        <PlayerProfileFields
          formData={formData}
          onInputChange={handleInputChange}
          onCitySelect={(cityData) => {
            handleCitySelectWithLocation(cityData, allLocations);
            setShowCheckmark(false);
          }}
          onLocationChange={(locationId) => {
            handleLocationChange(locationId);
            setShowCheckmark(false);
          }}
          locations={locations}
          isLoadingLocations={isLoadingLocations}
        />

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
            {PREFERRED_SIDE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          <button 
            type="submit" 
            className={`auth-modal__submit save-button ${showCheckmark ? 'save-success' : ''}`}
            disabled={isSubmitting || !hasChanges()}
          >
            {showCheckmark ? (
              <>
                <CheckCircle size={18} className="checkmark-icon" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save size={18} />
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
