import React from 'react';
import { Text } from 'react-native';

interface FormLabelProps {
  readonly children: React.ReactNode;
  readonly required?: boolean;
  readonly className?: string;
}

export default function FormLabel({
  children,
  required = false,
  className = '',
}: FormLabelProps): React.ReactNode {
  return (
    <Text
      className={`text-footnote font-semibold text-gray-700 dark:text-content-secondary mb-xs ${className}`}
    >
      {required ? <Text className="text-red-500">* </Text> : null}
      {children}
    </Text>
  );
}
