/**
 * Card component matching wireframe design.
 * White background, 12px radius, subtle shadow.
 * Dark mode: elevated surface with subtle border replacing shadow.
 */

import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

export default function Card({
  children,
  className = '',
  ...rest
}: CardProps): React.ReactNode {
  return (
    <View
      className={`bg-white dark:bg-dark-surface rounded-card p-lg shadow-sm dark:shadow-none dark:border dark:border-border-subtle ${className}`}
      {...rest}
    >
      {children}
    </View>
  );
}
