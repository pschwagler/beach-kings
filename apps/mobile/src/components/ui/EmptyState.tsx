/**
 * EmptyState component — centered placeholder for empty screens/lists.
 * Optional icon, title, description, and CTA button.
 */

import React from 'react';
import { View } from 'react-native';
import Button from './Button';
import AppText from './AppText';

export interface EmptyStateAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

export interface EmptyStateProps {
  readonly icon?: React.ReactNode;
  readonly title: string;
  readonly description?: string;
  /** Full fills its parent; section stays compact inside another surface. */
  readonly layout?: 'full' | 'section';
  readonly primaryAction?: EmptyStateAction;
  readonly secondaryAction?: EmptyStateAction;
  readonly testID?: string;
  /** @deprecated Prefer primaryAction. */
  readonly actionLabel?: string;
  /** @deprecated Prefer primaryAction. */
  readonly onAction?: () => void;
  readonly className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  layout = 'full',
  primaryAction,
  secondaryAction,
  testID = 'empty-state',
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps): React.ReactNode {
  const resolvedPrimary =
    primaryAction ??
    (actionLabel != null && onAction != null
      ? { label: actionLabel, onPress: onAction }
      : undefined);

  return (
    <View
      testID={testID}
      className={`${layout === 'full' ? 'flex-1 py-3xl' : 'py-xl'} items-center justify-center px-2xl ${className}`}
    >
      {icon != null && (
        <View
          testID={`${testID}-icon`}
          className="mb-lg"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {icon}
        </View>
      )}
      <AppText
        testID={`${testID}-title`}
        accessibilityRole="header"
        className="text-lg font-bold text-center text-default mb-sm"
      >
        {title}
      </AppText>
      {description != null && (
        <AppText
          testID={`${testID}-description`}
          className="text-body text-center text-muted mb-xl"
        >
          {description}
        </AppText>
      )}
      {(resolvedPrimary != null || secondaryAction != null) && (
        <View className="w-full max-w-[320px] gap-sm">
          {resolvedPrimary != null && (
            <Button
              testID={resolvedPrimary.testID ?? `${testID}-primary-action`}
              title={resolvedPrimary.label}
              onPress={resolvedPrimary.onPress}
            />
          )}
          {secondaryAction != null && (
            <Button
              testID={secondaryAction.testID ?? `${testID}-secondary-action`}
              title={secondaryAction.label}
              onPress={secondaryAction.onPress}
              variant="outline"
            />
          )}
        </View>
      )}
    </View>
  );
}
