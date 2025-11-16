import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Formats a US phone number to (XXX) XXX-XXXX format
 */
const formatPhoneNumber = (value) => {
  // Remove all non-digits
  const digits = value.replace(/\D/g, '');
  
  // Limit to 10 digits
  const limited = digits.slice(0, 10);
  
  // Format based on length
  if (limited.length === 0) return '';
  if (limited.length <= 3) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
};

/**
 * Converts formatted phone number to E.164 format (+15551234567)
 */
const toE164 = (formattedValue) => {
  const digits = formattedValue.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return '';
};

/**
 * Validates if a phone number is complete and valid
 */
const isValidPhoneNumber = (formattedValue) => {
  const digits = formattedValue.replace(/\D/g, '');
  return digits.length === 10;
};

export default function PhoneInput({ value, onChange, onValidationChange, className = '', required = false, placeholder = '(555) 123-4567' }) {
  const [displayValue, setDisplayValue] = useState('');
  const [isTouched, setIsTouched] = useState(false);
  const [error, setError] = useState('');

  // Initialize display value from prop
  useEffect(() => {
    if (value) {
      // If value is in E.164 format, convert to display format
      if (value.startsWith('+1')) {
        const digits = value.slice(2).replace(/\D/g, '');
        setDisplayValue(formatPhoneNumber(digits));
      } else {
        setDisplayValue(formatPhoneNumber(value));
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  // Validate and notify parent
  useEffect(() => {
    const hasValue = displayValue.trim().length > 0;
    const isValid = !hasValue ? !required : isValidPhoneNumber(displayValue);
    const e164Value = toE164(displayValue);
    
    if (onValidationChange) {
      onValidationChange({
        isValid,
        value: e164Value,
        displayValue,
      });
    }

    if (isTouched && hasValue && !isValidPhoneNumber(displayValue)) {
      setError('Please enter a valid phone number');
    } else if (isTouched && required && !hasValue) {
      setError('Phone number is required');
    } else {
      setError('');
    }
  }, [displayValue, isTouched, required, onValidationChange]);

  const handleChange = (e) => {
    const inputValue = e.target.value;
    const formatted = formatPhoneNumber(inputValue);
    setDisplayValue(formatted);
    setIsTouched(true);

    // Convert to E.164 and notify parent
    const e164Value = toE164(formatted);
    if (onChange) {
      onChange(e164Value || formatted);
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

