import { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { updatePlayerProfile, getLocations } from '../../services/api';
import { useLocationAutoSelect } from '../../hooks/useLocationAutoSelect';
import PlayerProfileFields from './PlayerProfileFields';

const defaultFormState = {
  nickname: '',
  gender: '',
  level: '',
  date_of_birth: '',
  city: '',
  state: '',
  city_latitude: null,
  city_longitude: null,
  location_id: '',
  distance_to_location: null,
};

const getErrorMessage = (error) => error.response?.data?.detail || error.message || 'Something went wrong';

export default function PlayerProfileModal({ isOpen, onClose, onSuccess, currentUserPlayer }) {
  const [formData, setFormData] = useState(defaultFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [allLocations, setAllLocations] = useState([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  
  const {
    locations,
    handleCitySelect: handleCitySelectWithLocation,
    handleLocationChange,
    updateLocationsWithDistances,
  } = useLocationAutoSelect(setFormData, setErrorMessage);

  useEffect(() => {
    if (isOpen) {
      // Pre-populate form with existing player data if available
      if (currentUserPlayer) {
        setFormData({
          nickname: currentUserPlayer.nickname || '',
          gender: currentUserPlayer.gender || '',
          level: currentUserPlayer.level || '',
          date_of_birth: currentUserPlayer.date_of_birth || '',
          city: currentUserPlayer.city || '',
          state: currentUserPlayer.state || '',
          city_latitude: currentUserPlayer.city_latitude || null,
          city_longitude: currentUserPlayer.city_longitude || null,
          location_id: currentUserPlayer.location_id ? String(currentUserPlayer.location_id) : '',
          distance_to_location: currentUserPlayer.distance_to_location || null,
        });
      } else {
        // Reset form when modal opens if no player data
        setFormData(defaultFormState);
      }
      setErrorMessage('');
      loadLocations();
    }
  }, [isOpen, currentUserPlayer]);

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

    if (!formData.city) {
      setErrorMessage('City is required');
      return;
    }

    if (!formData.location_id) {
      setErrorMessage('Location is required');
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

      if (formData.city) {
        payload.city = formData.city;
      }

      if (formData.state) {
        payload.state = formData.state;
      }

      if (formData.city_latitude !== null && formData.city_latitude !== undefined) {
        payload.city_latitude = formData.city_latitude;
      }

      if (formData.city_longitude !== null && formData.city_longitude !== undefined) {
        payload.city_longitude = formData.city_longitude;
      }

      if (formData.location_id) {
        payload.location_id = formData.location_id;  // location_id is now a string
      }

      if (formData.distance_to_location !== null && formData.distance_to_location !== undefined) {
        payload.distance_to_location = formData.distance_to_location;
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
          Please complete your player profile. Gender, skill level, city, and location are required.
        </p>

        {errorMessage && (
          <div className="auth-modal__alert error">
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
        )}

        <form className="auth-modal__form" onSubmit={handleSubmit}>
          <PlayerProfileFields
            formData={formData}
            onInputChange={(e) => {
              handleInputChange(e);
              setErrorMessage('');
            }}
            onCitySelect={(cityData) => {
              handleCitySelectWithLocation(cityData, allLocations);
            }}
            onLocationChange={handleLocationChange}
            locations={locations}
            isLoadingLocations={isLoadingLocations}
            showTooltips={true}
          />

          <button type="submit" className="auth-modal__submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
