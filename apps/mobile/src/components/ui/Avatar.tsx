/**
 * Avatar — profile photo with initials fallback.
 *
 * Sizes: sm=32, md=40, lg=56, xl=80.
 * Variants control the fallback-circle color when no photo is available:
 *   teal (default) — bright team-identity teal bg, white text (for team chips)
 *   gold           — bright team-identity gold bg, white text (for team chips)
 *   brand          — semantic brand-teal bg (navy in light, teal in dark), white text
 *   muted          — elevated/surface bg, muted text
 */

import React, { useState } from 'react';
import { View, Text, Image } from 'react-native';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AvatarVariant = 'teal' | 'gold' | 'brand' | 'muted';

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

/**
 * The `teal`/`gold` bg is an inline style rather than a NativeWind semantic
 * class because `bg-brand-teal` in light mode resolves to the dark-navy primary
 * text color (#1a3a4a), which is invisible against the team chip backgrounds.
 * These are the bright team-identity colors used consistently in both themes.
 *
 * The `brand` variant instead uses the semantic `bg-brand-teal` class (navy in
 * light, teal in dark) so plain-background rows (e.g. roster/standings lists)
 * match the filled navy avatars used elsewhere.
 */
const variantBgColor: Record<AvatarVariant, string | undefined> = {
  teal: '#4daacc',
  gold: '#d4a843',
  brand: undefined,
  muted: undefined,
};

/** Applied only when the variant has no inline bg color (brand/muted). */
const variantBgClass: Record<AvatarVariant, string> = {
  teal: '',
  gold: '',
  brand: 'bg-brand-teal',
  muted: 'bg-elevated',
};

const variantTextClass: Record<AvatarVariant, string> = {
  teal: 'text-white',
  gold: 'text-white',
  brand: 'text-white',
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
  const [imgError, setImgError] = useState(false);

  if (imageUrl != null && imageUrl.length > 0 && !imgError) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: dimension, height: dimension, borderRadius: dimension / 2 }}
        className={className}
        accessible={accessible}
        accessibilityLabel={accessible ? name : undefined}
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
    );
  }

  const bgColor = variantBgColor[variant];

  return (
    <View
      style={{
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
        ...(bgColor != null ? { backgroundColor: bgColor } : {}),
      }}
      className={`${variantBgClass[variant]} items-center justify-center ${className}`}
      accessible={accessible}
      accessibilityLabel={accessible ? name : undefined}
    >
      <Text className={`font-semibold ${variantTextClass[variant]} ${textSizes[size]}`}>
        {initials}
      </Text>
    </View>
  );
}
