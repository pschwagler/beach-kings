/**
 * Card component matching wireframe design.
 * Content surface with a restrained border. Elevation is reserved for
 * genuinely floating UI such as dialogs and toasts.
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
      className={`bg-surface rounded-card border border-divider p-lg ${className}`}
      {...rest}
    >
      {children}
    </View>
  );
}
