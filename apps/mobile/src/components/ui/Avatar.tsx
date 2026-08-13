/**
 * Avatar — profile photo with initials fallback.
 *
 * Sizes: sm=32, md=40, lg=56, xl=80.
 * Variants control the fallback-circle color when no photo is available:
 *   teal (default) — bright team-identity teal bg, white text (for team chips)
 *   gold           — bright team-identity gold bg, white text (for team chips)
 *   brand          — semantic brand-teal bg (navy in light, teal in dark), white text
 *   muted          — elevated/surface bg, muted text
 *
 * Pass `colorSeed` (e.g. a player id) to give each fallback circle a
 * deterministic decorative color from a per-item variety palette instead of the
 * flat `variant` color — used for friend/player lists where a wall of identical
 * teal circles reads poorly. `colorSeed` is ignored when a real photo renders.
 *
 * Convention: any avatar that represents a *specific player's identity* (home
 * header, profile, message thread, friend/suggestion rows, roster search) must
 * pass `colorSeed={player_id}` so the same player renders the same color on
 * every screen. Reserve `variant` for avatars whose color conveys something
 * other than identity (e.g. team color on the scoreboard / seated roster chip).
 */

import React, { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import AppText from '@/components/ui/AppText';
import { avatarTeamColors, avatarVarietyColors } from '@/theme/avatarColors';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | number;
export type AvatarVariant = 'teal' | 'gold' | 'brand' | 'muted' | 'guest';

interface AvatarProps {
  readonly imageUrl?: string | null;
  readonly name: string;
  readonly size?: AvatarSize;
  readonly variant?: AvatarVariant;
  /**
   * Stable identifier (player id or name) used to pick a deterministic
   * decorative color for the initials fallback. When set it overrides
   * `variant`'s color; ignored when a photo renders.
   */
  readonly colorSeed?: number | string;
  readonly className?: string;
  /** Classes applied only to the initials fallback (for example, guest borders). */
  readonly fallbackClassName?: string;
  readonly testID?: string;
  /** Set false when the parent element already provides an accessibility label for this avatar. */
  readonly accessible?: boolean;
}

const sizeDimensions: Record<Exclude<AvatarSize, number>, number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

const textSizes: Record<Exclude<AvatarSize, number>, string> = {
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
  teal: avatarTeamColors.teal.bg,
  gold: avatarTeamColors.gold.bg,
  brand: undefined,
  muted: undefined,
  guest: undefined,
};

/** Applied only when the variant has no inline bg color (brand/muted). */
const variantBgClass: Record<AvatarVariant, string> = {
  teal: '',
  gold: '',
  brand: 'bg-brand-teal',
  muted: 'bg-elevated',
  guest: 'bg-transparent',
};

const variantTextClass: Record<AvatarVariant, string> = {
  teal: '',
  gold: '',
  brand: 'text-on-brand-teal',
  muted: 'text-muted',
  guest: 'text-accent',
};

/** A single decorative variety color: tinted circle bg + readable initials fg. */
interface VarietyColor {
  readonly bg: string;
  readonly fg: string;
}

/**
 * Decorative per-item avatar palette (soft tinted bg + dark readable initials).
 * Deliberately NON-SEMANTIC identity colors — the documented exception to the
 * no-hardcoded-hex theming rule — so they intentionally do NOT track dark mode.
 * Mirrors the palette used by InvitePlayersScreen for app-wide consistency.
 */
const varietyColors: readonly VarietyColor[] = avatarVarietyColors;

const varietyFallback: VarietyColor = varietyColors[0] ?? avatarTeamColors.teal;

/** Deterministically map a stable seed to one of the {@link varietyColors}. */
function varietyColorFor(seed: number | string): VarietyColor {
  const n =
    typeof seed === 'number'
      ? Math.trunc(seed)
      : Array.from(seed).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const index = Math.abs(n) % varietyColors.length;
  return varietyColors[index] ?? varietyFallback;
}

export function getInitials(name: string): string {
  // Only tokens that start with a letter contribute initials, so names ending
  // in numbers (e.g. run-scoped test accounts) don't render digit initials.
  const letterParts = name
    .trim()
    .split(/\s+/)
    .filter((part) => /^[A-Za-z]/.test(part));
  if (letterParts.length === 0) {
    // No letter tokens at all — fall back to the first alphanumeric character
    // so the fallback is stable and never empty or a bare "?".
    return (name.trim().match(/[A-Za-z0-9]/)?.[0] ?? '').toUpperCase();
  }
  const first = letterParts[0]?.[0] ?? '';
  const last =
    letterParts.length > 1
      ? (letterParts[letterParts.length - 1]?.[0] ?? '')
      : '';
  return (first + last).toUpperCase();
}

export function isImageUri(value: string | null | undefined): value is string {
  if (value == null) return false;
  return /^(?:https?:|file:|data:|content:|blob:)/i.test(value.trim());
}

export default function Avatar({
  imageUrl,
  name,
  size = 'md',
  variant = 'teal',
  colorSeed,
  className = '',
  fallbackClassName = '',
  testID,
  accessible = true,
}: AvatarProps): React.ReactNode {
  const dimension = typeof size === 'number' ? size : sizeDimensions[size];
  const textClassName = typeof size === 'number' ? '' : textSizes[size];
  const initials = getInitials(name);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [imageUrl]);

  if (isImageUri(imageUrl) && !imgError) {
    return (
      <Image
        testID={testID}
        source={{ uri: imageUrl }}
        style={{
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
        }}
        className={className}
        accessible={accessible}
        accessibilityLabel={accessible ? name : undefined}
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
    );
  }

  const variety = colorSeed != null ? varietyColorFor(colorSeed) : null;
  const bgColor = variety?.bg ?? variantBgColor[variant];
  const variantFg =
    variant === 'teal'
      ? avatarTeamColors.teal.fg
      : variant === 'gold'
        ? avatarTeamColors.gold.fg
        : undefined;

  return (
    <View
      testID={testID}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
        ...(bgColor != null ? { backgroundColor: bgColor } : {}),
      }}
      className={`${variety != null ? '' : variantBgClass[variant]} items-center justify-center ${fallbackClassName} ${className}`}
      accessible={accessible}
      accessibilityLabel={accessible ? name : undefined}
    >
      <AppText
        style={{
          ...(variety != null ? { color: variety.fg } : {}),
          ...(variety == null && variantFg != null ? { color: variantFg } : {}),
          ...(typeof size === 'number'
            ? { fontSize: Math.max(9, Math.round(size * 0.32)) }
            : {}),
        }}
        className={`font-semibold ${variety != null ? '' : variantTextClass[variant]} ${textClassName}`}
      >
        {initials}
      </AppText>
    </View>
  );
}
