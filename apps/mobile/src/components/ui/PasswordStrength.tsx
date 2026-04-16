/**
 * PasswordStrength — 4-segment bar showing password strength.
 * Strength 0-4 based on length and character variety.
 * Segments colored red/orange/yellow/green by score.
 */

import React from 'react';
import { View, Text } from 'react-native';

interface PasswordStrengthProps {
  readonly password: string;
  readonly className?: string;
}

function calcStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(4, score);
}

const SEGMENT_COLORS = [
  'bg-red-500',
  'bg-orange-400',
  'bg-yellow-400',
  'bg-green-500',
] as const;

const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'] as const;

export default function PasswordStrength({
  password,
  className = '',
}: PasswordStrengthProps): React.ReactNode {
  const strength = calcStrength(password);

  return (
    <View className={`gap-1 ${className}`}>
      <View className="flex-row gap-1">
        {SEGMENT_COLORS.map((color, index) => (
          <View
            key={index}
            className={`flex-1 h-1.5 rounded-full ${
              index < strength ? color : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        ))}
      </View>
      {strength > 0 && (
        <Text className="text-xs text-text-secondary dark:text-content-secondary">
          {LABELS[strength]}
        </Text>
      )}
    </View>
  );
}
