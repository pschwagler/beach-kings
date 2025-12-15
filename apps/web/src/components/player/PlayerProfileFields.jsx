'use client';

import { Info } from "lucide-react";
import { Tooltip } from "../ui/UI";
import CityAutocomplete from "../ui/CityAutocomplete";
import {
  GENDER_OPTIONS,
  SKILL_LEVEL_OPTIONS,
} from "../../utils/playerFormConstants";

/**
 * Reusable player profile form fields component.
 * Can be used in both PlayerProfileModal and ProfileTab.
 */
export default function PlayerProfileFields({
  formData,
  onInputChange,
  onCitySelect,
  locations = [],
  isLoadingLocations = false,
  showTooltips = false,
  onLocationChange,
}) {
  return (
    <>
      <label className="auth-modal__label">
        <span>
          Gender <span className="required-asterisk">*</span>
          {showTooltips && (
            <Tooltip
              text='Gender selection is required for gendered divisions (Mens/Womens). If you choose "prefer not to say", you will only be eligible for coed divisions.'
              multiline={true}
            >
              <Info size={16} className="info-icon" />
            </Tooltip>
          )}
        </span>
        <select
          name="gender"
          className="auth-modal__input"
          value={formData.gender}
          onChange={onInputChange}
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
        <span>
          City<span className="required-asterisk">*</span>
        </span>
        <CityAutocomplete
          value={formData.city}
          onChange={onInputChange}
          onCitySelect={onCitySelect}
          required={true}
          placeholder="Enter your city/zip"
        />
      </label>

      <label className="auth-modal__label">
        <span>
          Location <span className="required-asterisk">*</span>
        </span>
        <select
          name="location_id"
          className="auth-modal__input"
          value={formData.location_id || ""}
          onChange={(e) => {
            onInputChange(e);
            if (onLocationChange) {
              onLocationChange(e.target.value);
            }
          }}
          disabled={isLoadingLocations}
          required={true}
        >
          <option value=""></option>
          {locations.map((location) => {
            const displayName =
              location.distance_miles !== undefined
                ? `${location.name} (${location.distance_miles} mi)`
                : location.name;
            return (
              <option key={location.id} value={location.id}>
                {displayName}
              </option>
            );
          })}
        </select>
      </label>

      <label className="auth-modal__label">
        <span>
          Skill Level<span className="required-asterisk">*</span>
        </span>
        <select
          name="level"
          className="auth-modal__input"
          value={formData.level}
          onChange={onInputChange}
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
          placeholder=""
          value={formData.nickname}
          onChange={onInputChange}
        />
      </label>

      <label className="auth-modal__label">
        Date of Birth
        <input
          type="date"
          name="date_of_birth"
          className="auth-modal__input"
          value={formData.date_of_birth}
          onChange={onInputChange}
        />
      </label>
    </>
  );
}


