/**
 * Avatar component — profile image with initials fallback.
 * Sizes: sm=32, md=40, lg=56, xl=80.
 * Shows Image if URL provided, otherwise teal circle with initials.
 */

import React from 'react';
import { View, Text, Image } from 'react-native';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  readonly imageUrl?: string | null;
  readonly name: string;
  readonly size?: AvatarSize;
  readonly className?: string;
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

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export default function Avatar({
  imageUrl,
  name,
  size = 'md',
  className = '',
}: AvatarProps): React.ReactNode {
  const dimension = sizeDimensions[size];
  const initials = getInitials(name);

  if (imageUrl != null && imageUrl.length > 0) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
        className={className}
        accessibilityLabel={name}
      />
    );
  }

  return (
    <View
      style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
      className={`bg-primary dark:bg-brand-teal items-center justify-center ${className}`}
      accessibilityLabel={name}
    >
      <Text className={`text-white font-semibold ${textSizes[size]}`}>
        {initials}
      </Text>
    </View>
  );
}
