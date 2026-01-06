'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Formats phone number to (XXX) XXX-XXXX
 */
const formatPhone = (digits) => {
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

/**
 * Extracts digits from phone input, handling country code
 */
const getDigits = (text) => {
  // Remove all non-digits
  const allDigits = text.replace(/\D/g, '');
  
  // If we have 11 digits and it starts with 1, it's likely +1 country code
  // Strip the leading 1 to get the 10-digit number
  if (allDigits.length === 11 && allDigits.startsWith('1')) {
    return allDigits.slice(1);
  }
  
  // If text contains +1, we know the country code is there
  // Extract digits and if we get 11 starting with 1, take last 10
  if (text.includes('+1') || text.includes('+ 1')) {
    if (allDigits.length >= 11 && allDigits.startsWith('1')) {
      return allDigits.slice(1, 11);
    }
  }
  
  // Otherwise, just take the last 10 digits (handles edge cases)
  return allDigits.slice(-10);
};

/**
 * Converts to E.164 format (+15551234567)
 */
const toE164 = (digits) => {
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return '';
};

/**
 * Validates if a phone number is complete and valid
 */
const isValidPhoneNumber = (digits) => {
  return digits.length === 10;
};

export default function PhoneInput({ value, onChange, onValidationChange, className = '', required = false, placeholder = '(555) 123-4567' }) {
  const [displayValue, setDisplayValue] = useState('');
  const [isTouched, setIsTouched] = useState(false);
  const [error, setError] = useState('');
  const onValidationChangeRef = useRef(onValidationChange);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onValidationChangeRef.current = onValidationChange;
  }, [onValidationChange]);

  // Initialize display value from prop
  useEffect(() => {
    if (value) {
      // If value is in E.164 format, convert to display format
      if (value.startsWith('+1')) {
        const digits = value.slice(2).replace(/\D/g, '');
        setDisplayValue(formatPhone(digits));
      } else {
        const digits = getDigits(value);
        setDisplayValue(formatPhone(digits));
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  // Validate and notify parent
  useEffect(() => {
    const digits = getDigits(displayValue);
    const hasValue = digits.length > 0;
    const isValid = isValidPhoneNumber(digits);
    const e164Value = toE164(digits);
    
    if (onValidationChangeRef.current) {
      onValidationChangeRef.current({
        isValid: isValid && hasValue,
        value: e164Value,
        displayValue: displayValue || placeholder,
      });
    }

    if (isTouched) {
      if (required && !hasValue) {
        setError('Phone number is required');
      } else if (hasValue && !isValid) {
        setError('Please enter a valid 10-digit phone number');
      } else {
        setError('');
      }
    } else {
      setError('');
    }
  }, [displayValue, isTouched, required, placeholder]);

  const handleChange = (e) => {
    const inputValue = e.target.value;
    const digits = getDigits(inputValue);
    const formatted = formatPhone(digits);
    setDisplayValue(formatted);
    setIsTouched(true);

    // Convert to E.164 and notify parent
    const e164Value = toE164(digits);
    if (onChange) {
      onChange(e164Value || '');
    }
  };

  const handleBlur = () => {
    setIsTouched(true);
  };

  const hasError = isTouched && error;

  return (
    <div className={`phone-input ${className}`}>
      <div className="phone-input__wrapper">
        <div className="phone-input__country-code">
          <span className="phone-input__country-code-text">+1</span>
        </div>
        <div className="phone-input__input-wrapper">
          <input
            type="tel"
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={`phone-input__input ${hasError ? 'phone-input__input--error' : ''}`}
            required={required}
            aria-invalid={hasError}
            aria-describedby={hasError ? 'phone-input-error' : undefined}
          />
          {hasError && (
            <div className="phone-input__error-icon" aria-hidden="true">
              <AlertCircle size={16} />
            </div>
          )}
        </div>
      </div>
      {hasError && (
        <div id="phone-input-error" className="phone-input__error-message" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
