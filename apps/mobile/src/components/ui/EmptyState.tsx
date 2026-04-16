/**
 * EmptyState component — centered placeholder for empty screens/lists.
 * Optional icon, title, description, and CTA button.
 */

import React from 'react';
import { View, Text } from 'react-native';
import Button from './Button';

interface EmptyStateProps {
  readonly icon?: React.ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps): React.ReactNode {
  return (
    <View
      className={`flex-1 items-center justify-center px-2xl py-3xl ${className}`}
    >
      {icon != null && (
        <View className="mb-lg">{icon}</View>
      )}
      <Text className="text-lg font-bold text-center text-text-default dark:text-content-primary mb-sm">
        {title}
      </Text>
      {description != null && (
        <Text className="text-body text-center text-text-muted dark:text-text-tertiary mb-xl">
          {description}
        </Text>
      )}
      {actionLabel != null && onAction != null && (
        <Button title={actionLabel} onPress={onAction} className="mt-sm" />
      )}
    </View>
  );
}
