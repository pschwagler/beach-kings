/**
 * PasswordStrength — 4-segment bar showing password strength.
 * Strength 0-4 based on length and character variety.
 * Segments colored red/orange/yellow/green by score.
 */

import React from 'react';
import { View } from 'react-native';
import AppText from '@/components/ui/AppText';

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

const SEGMENTS = [
  { key: 'weak', color: 'bg-danger-fill' },
  { key: 'fair', color: 'bg-warning-fill' },
  { key: 'good', color: 'bg-warning-fill' },
  { key: 'strong', color: 'bg-success-fill' },
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
        {SEGMENTS.map((segment, index) => (
          <View
            key={segment.key}
            className={`flex-1 h-1.5 rounded-full ${
              index < strength ? segment.color : 'bg-elevated'
            }`}
          />
        ))}
      </View>
      {strength > 0 && (
        <AppText className="text-xs text-muted">{LABELS[strength]}</AppText>
      )}
    </View>
  );
}
