import React from 'react';
import AppText from '@/components/ui/AppText';

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
    <AppText
      className={`text-caption text-danger mt-xxs ${className}`}
      accessibilityRole="alert"
    >
      {message}
    </AppText>
  );
}
