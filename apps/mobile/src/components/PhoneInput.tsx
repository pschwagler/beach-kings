import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { XStack, YStack, getTokens } from 'tamagui';
import { AlertCircle } from 'lucide-react-native';
import { Input } from './ui/Input';
import { Text as UIText } from './ui/Text';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (validation: { isValid: boolean; value: string; displayValue: string; error?: string }) => void;
  required?: boolean;
  placeholder?: string;
  returnKeyType?: 'next' | 'done' | 'go' | 'send';
  onSubmitEditing?: () => void;
}

/**
 * Formats phone number to (XXX) XXX-XXXX
 */
const formatPhone = (digits: string): string => {
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

/**
 * Extracts digits from phone input, handling country code
 */
const getDigits = (text: string): string => {
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
const toE164 = (digits: string): string => {
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return '';
};

const PhoneInputComponent = forwardRef<any, PhoneInputProps>(({
  value,
  onChange,
  onValidationChange,
  required = false,
  placeholder = '(555) 123-4567',
  returnKeyType = 'next',
  onSubmitEditing,
}, ref) => {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const inputRef = useRef<any>(null);
  
  // Use refs to avoid including callbacks in useEffect dependencies
  const onChangeRef = useRef(onChange);
  const onValidationChangeRef = useRef(onValidationChange);
  const lastE164ValueRef = useRef('');

  // Expose focus method to parent via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
  }));

  // Keep refs updated
  useEffect(() => {
    onChangeRef.current = onChange;
    onValidationChangeRef.current = onValidationChange;
  }, [onChange, onValidationChange]);

  // Initialize from prop value only on mount or when value changes externally
  // (not from our own onChange calls)
  const prevValueRef = useRef(value);
  
  useEffect(() => {
    // Only sync if value prop changed externally (not from our onChange)
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      
      if (value) {
        // If value is in E.164 format (+1...), extract digits
        const digits = value.startsWith('+1') ? value.slice(2).replace(/\D/g, '') : value.replace(/\D/g, '');
        const formatted = formatPhone(digits);
        if (formatted !== displayValue) {
          setDisplayValue(formatted);
        }
      } else if (displayValue !== '') {
        setDisplayValue('');
      }
    }
  }, [value]);

  // Validate and notify parent (only when displayValue or validation state changes)
  useEffect(() => {
    const digits = getDigits(displayValue);
    const isValid = digits.length === 10;
    const e164Value = toE164(digits);
    const hasValue = digits.length > 0;

    let error = '';
    if (isTouched) {
      if (required && !hasValue) {
        error = 'Phone number is required';
      } else if (hasValue && !isValid) {
        error = 'Please enter a valid 10-digit phone number';
      }
    }

    // Only call validation callback
    if (onValidationChangeRef.current) {
      onValidationChangeRef.current({
        isValid: isValid && hasValue,
        value: e164Value,
        displayValue: displayValue || placeholder,
        error: error || undefined,
      });
    }
  }, [displayValue, isTouched, required, placeholder]);

  const handleChange = (text: string) => {
    // Handle autocomplete input that might include +1 prefix
    // If text already has formatting like "+1 (716) 783-1211", extract just the 10 digits
    const digits = getDigits(text);
    const formatted = formatPhone(digits);
    setDisplayValue(formatted);
    setIsTouched(true);
    
    // Call onChange with E.164 value when user types
    const e164Value = toE164(digits);
    if (e164Value !== lastE164ValueRef.current) {
      lastE164ValueRef.current = e164Value;
      prevValueRef.current = e164Value;
      if (onChangeRef.current) {
        onChangeRef.current(e164Value);
      }
    } else if (digits.length === 0 && lastE164ValueRef.current !== '') {
      // Handle clearing
      lastE164ValueRef.current = '';
      prevValueRef.current = '';
      if (onChangeRef.current) {
        onChangeRef.current('');
      }
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setIsTouched(true);
  };

  const digits = getDigits(displayValue);
  const isValid = digits.length === 10;
  const hasError = isTouched && ((required && digits.length === 0) || (digits.length > 0 && !isValid));
  const tokens = getTokens();
  const dangerColor = (tokens.color as any)?.danger?.val || '#ef4444';

  return (
    <>
      <XStack
        alignItems="center"
        borderWidth={1}
        borderColor={hasError ? '$danger' : isFocused ? '$primary' : '$border'}
        borderRadius={10}
        backgroundColor="$background"
        minHeight={38}
        overflow="hidden"
      >
        <XStack
          paddingHorizontal="$3"
          backgroundColor="$gray200"
          borderRightWidth={1}
          borderRightColor="$border"
          justifyContent="center"
          alignItems="center"
          minWidth={50}
          height={38}
        >
          <UIText fontSize="$3" color="$textSecondary" fontWeight="500">
            +1
          </UIText>
        </XStack>
        <XStack flex={1} alignItems="center">
          <Input
            ref={inputRef}
            value={displayValue}
            onChangeText={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            borderWidth={0}
            backgroundColor="$background"
            paddingHorizontal="$sm"
            paddingVertical={0}
            minHeight={38}
            flex={1}
            placeholderTextColor="$textSecondary"
            color="$textPrimary"
          />
          {hasError && (
            <XStack paddingRight="$3">
              <AlertCircle size={16} color={dangerColor} />
            </XStack>
          )}
        </XStack>
      </XStack>
      {hasError && (
        <UIText fontSize="$1" color="$danger" marginTop="$xs" marginLeft="$3">
          {required && digits.length === 0
            ? 'Phone number is required'
            : 'Please enter a valid 10-digit phone number'}
        </UIText>
      )}
    </>
  );
});

PhoneInputComponent.displayName = 'PhoneInput';

export default PhoneInputComponent;

