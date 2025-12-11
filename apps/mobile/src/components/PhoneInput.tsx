import React, { useState, useEffect, useRef } from 'react';
import { Input as TamaguiInput, XStack, YStack, Text, getTokens } from 'tamagui';
import { AlertCircle } from 'lucide-react-native';

/**
 * Formats a US phone number to (XXX) XXX-XXXX format
 */
const formatPhoneNumber = (value: string): string => {
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
 * Parses phone input that may include country code
 * Returns { countryCode: string, localNumber: string }
 */
const parsePhoneInput = (input: string): { countryCode: string; localNumber: string } => {
  // Remove all non-digit and non-plus characters
  const cleaned = input.replace(/[^\d+]/g, '');
  
  // Check if it starts with +1
  if (cleaned.startsWith('+1')) {
    const localDigits = cleaned.slice(2).replace(/\D/g, '').slice(0, 10);
    return { countryCode: '+1', localNumber: localDigits };
  }
  
  // Check if it starts with 1 (without +)
  if (cleaned.startsWith('1') && cleaned.length > 10) {
    const localDigits = cleaned.slice(1).replace(/\D/g, '').slice(0, 10);
    return { countryCode: '+1', localNumber: localDigits };
  }
  
  // Otherwise, treat as local number
  const localDigits = cleaned.replace(/\D/g, '').slice(0, 10);
  return { countryCode: '+1', localNumber: localDigits };
};

/**
 * Converts to E.164 format (+15551234567)
 */
const toE164 = (countryCode: string, localNumber: string): string => {
  const digits = localNumber.replace(/\D/g, '');
  if (digits.length === 10 && countryCode === '+1') {
    return `+1${digits}`;
  }
  return '';
};

/**
 * Validates if a phone number is complete and valid (+1 country code required)
 */
const isValidPhoneNumber = (countryCode: string, localNumber: string): boolean => {
  const digits = localNumber.replace(/\D/g, '');
  return countryCode === '+1' && digits.length === 10;
};

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (validation: { isValid: boolean; value: string; displayValue: string; error?: string }) => void;
  required?: boolean;
  placeholder?: string;
  returnKeyType?: 'next' | 'done' | 'go' | 'send';
  onSubmitEditing?: () => void;
}

export default function PhoneInput({ 
  value, 
  onChange, 
  onValidationChange, 
  required = false, 
  placeholder = '+1 (555) 123-4567',
  returnKeyType = 'next',
  onSubmitEditing,
}: PhoneInputProps) {
  const tokens = getTokens();
  const [inputValue, setInputValue] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [displayValue, setDisplayValue] = useState('');
  const [isTouched, setIsTouched] = useState(false);
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const onValidationChangeRef = useRef(onValidationChange);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    onValidationChangeRef.current = onValidationChange;
  }, [onValidationChange]);

  // Initialize from prop value
  useEffect(() => {
    if (value) {
      // If value is in E.164 format, parse it
      if (value.startsWith('+1')) {
        const localDigits = value.slice(2).replace(/\D/g, '');
        setCountryCode('+1');
        setInputValue(localDigits);
        setDisplayValue(formatPhoneNumber(localDigits));
      } else {
        // Try to parse as full input
        const parsed = parsePhoneInput(value);
        setCountryCode(parsed.countryCode);
        setInputValue(parsed.localNumber);
        setDisplayValue(formatPhoneNumber(parsed.localNumber));
      }
    } else {
      setInputValue('');
      setDisplayValue('');
      setCountryCode('+1');
    }
  }, [value]);

  // Validate and notify parent
  useEffect(() => {
    const hasValue = inputValue.trim().length > 0;
    const isValid = !hasValue ? !required : isValidPhoneNumber(countryCode, inputValue);
    const e164Value = toE164(countryCode, inputValue);
    
    let validationError = '';
    if (isTouched && hasValue) {
      if (countryCode !== '+1') {
        validationError = 'Only +1 (US/Canada) country code is supported';
      } else if (inputValue.replace(/\D/g, '').length !== 10) {
        validationError = 'Please enter a valid 10-digit phone number';
      }
    } else if (isTouched && required && !hasValue) {
      validationError = 'Phone number is required';
    }
    
    setError(validationError);
    
    if (onValidationChangeRef.current) {
      onValidationChangeRef.current({
        isValid: isValid && !validationError,
        value: e164Value,
        displayValue: countryCode === '+1' ? displayValue : `${countryCode} ${displayValue}`,
        error: validationError || undefined,
      });
    }
  }, [inputValue, countryCode, displayValue, isTouched, required]);

  const handleChange = (text: string) => {
    // Parse the input to extract country code and local number
    const parsed = parsePhoneInput(text);
    
    setCountryCode(parsed.countryCode);
    setInputValue(parsed.localNumber);
    setDisplayValue(formatPhoneNumber(parsed.localNumber));
    setIsTouched(true);

    // Convert to E.164 and notify parent
    const e164Value = toE164(parsed.countryCode, parsed.localNumber);
    if (onChange) {
      onChange(e164Value || (parsed.countryCode === '+1' ? formatPhoneNumber(parsed.localNumber) : `${parsed.countryCode} ${parsed.localNumber}`));
    }
  };

  const handleBlur = () => {
    setIsTouched(true);
    setIsFocused(false);
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const hasError = isTouched && error;

  // Build the full display value for the input
  const fullDisplayValue = countryCode === '+1' 
    ? displayValue 
    : `${countryCode} ${displayValue}`;

  // Determine border color based on state
  const borderColor = hasError 
    ? tokens.color.danger.val
    : isFocused 
      ? tokens.color.mutedRed.val
      : 'rgba(59, 130, 200, 0.25)';

  return (
    <YStack space="$xs">
      <XStack
        alignItems="stretch"
        borderRadius={10}
        borderWidth={1}
        borderColor={borderColor}
        overflow="hidden"
        backgroundColor="white"
        minHeight={44}
      >
        <XStack
          backgroundColor="rgba(59, 130, 200, 0.05)"
          paddingHorizontal={12}
          paddingVertical={10}
          borderTopLeftRadius={10}
          borderBottomLeftRadius={10}
          borderRightWidth={1}
          borderRightColor="rgba(59, 130, 200, 0.25)"
          minWidth={50}
          minHeight={44}
          justifyContent="center"
        >
          <Text fontSize="$2" color="$textSecondary" fontWeight="500">
            {countryCode}
          </Text>
        </XStack>
        <XStack flex={1} position="relative" alignItems="center">
          <TamaguiInput
            flex={1}
            borderWidth={0}
            paddingHorizontal={12}
            paddingVertical={10}
            fontSize="$3"
            color="$textPrimary"
            backgroundColor="transparent"
            value={fullDisplayValue}
            onChangeText={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            placeholder={placeholder}
            placeholderTextColor={tokens.color.textLight.val}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            editable={true}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
          />
          {hasError && (
            <XStack position="absolute" right="$sm" alignItems="center">
              <AlertCircle size={16} color={tokens.color.danger.val} />
            </XStack>
          )}
        </XStack>
      </XStack>
      {hasError && (
        <Text fontSize="$1" color="$danger" paddingLeft="$sm">
          {error}
        </Text>
      )}
    </YStack>
  );
}
