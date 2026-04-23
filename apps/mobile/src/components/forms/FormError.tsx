import React from 'react';
import { Text } from 'react-native';

interface FormErrorProps {
  readonly message?: string;
  readonly className?: string;
}

export default function FormError({
  message,
  className = '',
}: FormErrorProps): React.ReactNode {
  if (!message) return null;
  return (
    <Text
      className={`text-caption text-red-500 mt-xxs ${className}`}
      accessibilityRole="alert"
    >
      {message}
    </Text>
  );
}
