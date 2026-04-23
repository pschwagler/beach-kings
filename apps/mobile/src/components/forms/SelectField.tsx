import React from 'react';
import { Pressable, Text } from 'react-native';
import { ChevronDownIcon } from '@/components/ui/icons';

interface SelectFieldProps {
  readonly placeholder: string;
  readonly value: string;
  readonly error?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}

export default function SelectField({
  placeholder,
  value,
  error = false,
  disabled = false,
  onPress,
  testID,
}: SelectFieldProps): React.ReactNode {
  const hasValue = !!value;
  return (
    <Pressable
      className={`h-12 px-md flex-row items-center justify-between rounded-lg border bg-white dark:bg-elevated ${
        error
          ? 'border-red-500 dark:border-red-500'
          : 'border-border dark:border-border-strong'
      } ${disabled ? 'opacity-50' : ''}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={hasValue ? value : placeholder}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <Text
        className={`text-body flex-1 ${
          hasValue
            ? 'text-primary dark:text-content-primary'
            : 'text-gray-400 dark:text-content-tertiary'
        }`}
        numberOfLines={1}
      >
        {hasValue ? value : placeholder}
      </Text>
      <ChevronDownIcon size={16} color="#999" />
    </Pressable>
  );
}
