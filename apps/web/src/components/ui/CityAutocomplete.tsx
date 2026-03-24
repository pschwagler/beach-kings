'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getCityAutocomplete } from '../../services/api';
import { useDebounce } from '../../utils/debounce';
import './CityAutocomplete.css';

/**
 * CityAutocomplete component for city selection with autocomplete suggestions.
 * Uses backend proxy to Geoapify Autocomplete API (keeps API key secure).
 */
export default function CityAutocomplete({ 
  value = '', 
  onChange, 
  onCitySelect,
  className = '', 
  required = false, 
  placeholder = 'Enter your city/zip',
  disabled = false
}) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState(null);
  const wrapperRef = useRef(null);

  // Update input value when prop changes
  useEffect(() => {
    if (value !== inputValue && !selectedCity) {
      setInputValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchSuggestions = useCallback(async (searchText) => {
    if (!searchText || searchText.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await getCityAutocomplete(searchText);
      if (data.features && data.features.length > 0) {
        const formattedSuggestions = data.features.map((feature) => {
          const props = feature.properties;
          const coords = feature.geometry.coordinates;
          
          // Special handling for New York City: use district as city if available
          let city = props.city || props.name || '';
          const district = props.district || props.suburb || '';
          
          if (city === 'New York' && district && district !== 'Manhattan') {
            city = district;
          }
          
          const state = props.state || props.state_code || '';
          // Format as "city, state" for display
          const displayFormat = state ? `${city}, ${state}` : city;
          
          return {
            city: city,
            state: state,
            formatted: displayFormat,
            lat: coords[1],
            lon: coords[0]
          };
        });
        
        // Deduplicate by city/state combination (keep first occurrence)
        const seen = new Set();
        const uniqueSuggestions = formattedSuggestions.filter((suggestion) => {
          const key = `${suggestion.city}|${suggestion.state}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
        
        setSuggestions(uniqueSuggestions);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Error fetching city suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced version of fetchSuggestions
  const debouncedFetchSuggestions = useDebounce(fetchSuggestions, 300);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSelectedCity(null);
    setShowSuggestions(false);

    // Call debounced fetch
    debouncedFetchSuggestions(newValue);

    // Call onChange immediately for form validation
    if (onChange) {
      onChange(e);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion.formatted);
    setSelectedCity(suggestion);
    setShowSuggestions(false);
    setSuggestions([]);

    // Call onChange with the formatted value
    if (onChange) {
      const syntheticEvent = {
        target: {
          name: 'city',
          value: suggestion.formatted
        }
      };
      onChange(syntheticEvent);
    }

    // Call onCitySelect with city, state, and coordinates
    if (onCitySelect) {
      onCitySelect({
        city: suggestion.city,
        state: suggestion.state,
        formatted: suggestion.formatted,
        lat: suggestion.lat,
        lon: suggestion.lon
      });
    }
  };

  return (
    <div ref={wrapperRef} className={`city-autocomplete ${className}`}>
      <input
        type="text"
        name="city"
        className="auth-modal__input"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => {
          if (suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {isLoading && (
        <div className="city-autocomplete__loading">Loading...</div>
      )}
      {showSuggestions && suggestions.length > 0 && (
        <ul className="city-autocomplete__suggestions">
          {suggestions.map((suggestion, index) => (
            <li
              key={index}
              className="city-autocomplete__item"
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <div className="city-autocomplete__city">{suggestion.city}</div>
              <div className="city-autocomplete__state">{suggestion.state}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
