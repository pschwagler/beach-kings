/**
 * Divider component — 1px horizontal rule.
 * Dark mode: lighter gray on dark surfaces.
 */

import React from 'react';
import { View } from 'react-native';

interface DividerProps {
  readonly className?: string;
}

export default function Divider({ className = '' }: DividerProps): React.ReactNode {
  return (
    <View
      className={`h-px w-full bg-gray-200 dark:bg-gray-700 ${className}`}
      accessibilityRole="none"
    />
  );
}
