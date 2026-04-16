/**
 * ProgressBar — horizontal fill bar with teal default color.
 * Track: gray-200 / dark:gray-700. Fill: teal or custom color.
 * Height 6px, rounded-full.
 */

import React from 'react';
import { View } from 'react-native';

interface ProgressBarProps {
  readonly progress: number;
  readonly color?: string;
  readonly className?: string;
}

const DEFAULT_COLOR = '#0D9488';

export default function ProgressBar({
  progress,
  color = DEFAULT_COLOR,
  className = '',
}: ProgressBarProps): React.ReactNode {
  const clampedProgress = Math.min(1, Math.max(0, progress));

  return (
    <View className={`h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden ${className}`}>
      <View
        className="h-full rounded-full"
        style={{
          width: `${clampedProgress * 100}%`,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
