/**
 * Avatar — profile photo with initials fallback.
 *
 * Sizes: sm=32, md=40, lg=56, xl=80.
 * Variants control the fallback-circle color when no photo is available:
 *   teal (default) — brand teal bg, white text
 *   gold           — brand gold bg, white text
 *   muted          — elevated/surface bg, muted text
 */

import React from 'react';
import { View, Text, Image } from 'react-native';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AvatarVariant = 'teal' | 'gold' | 'muted';

interface AvatarProps {
  readonly imageUrl?: string | null;
  readonly name: string;
  readonly size?: AvatarSize;
  readonly variant?: AvatarVariant;
  readonly className?: string;
  /** Set false when the parent element already provides an accessibility label for this avatar. */
  readonly accessible?: boolean;
}

const sizeDimensions: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

const textSizes: Record<AvatarSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-lg',
  xl: 'text-2xl',
};

const variantBg: Record<AvatarVariant, string> = {
  teal: 'bg-brand-teal',
  gold: 'bg-brand-gold',
  muted: 'bg-elevated',
};

const variantText: Record<AvatarVariant, string> = {
  teal: 'text-white',
  gold: 'text-white',
  muted: 'text-muted',
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export default function Avatar({
  imageUrl,
  name,
  size = 'md',
  variant = 'teal',
  className = '',
  accessible = true,
}: AvatarProps): React.ReactNode {
  const dimension = sizeDimensions[size];
  const initials = getInitials(name);

  if (imageUrl != null && imageUrl.length > 0) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
        className={className}
        accessible={accessible}
        accessibilityLabel={accessible ? name : undefined}
      />
    );
  }

  return (
    <View
      style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
      className={`${variantBg[variant]} items-center justify-center ${className}`}
      accessible={accessible}
      accessibilityLabel={accessible ? name : undefined}
    >
      <Text className={`font-semibold ${variantText[variant]} ${textSizes[size]}`}>
        {initials}
      </Text>
    </View>
  );
}
