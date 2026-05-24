/**
 * Top navigation bar matching wireframe design.
 * 44px height, dark teal background, white title centered.
 * Dark mode: near-black bg with subtle bottom border.
 *
 * Modes:
 *   searchMode  — replaces the title with an inline SearchBar
 *   transparent — renders with a transparent background (white icons/text)
 */

import React from 'react';
import { View, Text } from 'react-native';
import BackButton from './BackButton';
import SearchBar from './SearchBar';

interface TopNavProps {
  readonly title: string;
  readonly showBack?: boolean;
  /**
   * Fallback route when the screen has no back history (e.g. deep-linked).
   * Passed to `BackButton`; when omitted, always calls `router.back()`.
   */
  readonly backFallback?: string;
  /**
   * Fully override the back-button press handler. Ignores `backFallback`.
   * Use for inline sub-views where router.back() would leave the screen.
   */
  readonly onBack?: () => void;
  /**
   * Custom element for the left slot. Overrides `showBack` when provided.
   * Useful for modal screens that need a close button (✕) instead of a chevron.
   */
  readonly leftAction?: React.ReactNode;
  readonly rightAction?: React.ReactNode;
  /** Replace the title with an inline search input. */
  readonly searchMode?: boolean;
  readonly searchValue?: string;
  readonly onSearchChange?: (text: string) => void;
  readonly searchPlaceholder?: string;
  /** Render with no background — white icons and text over any content below. */
  readonly transparent?: boolean;
}

export default function TopNav({
  title,
  showBack = false,
  backFallback,
  onBack,
  leftAction,
  rightAction,
  searchMode = false,
  searchValue = '',
  onSearchChange,
  searchPlaceholder,
  transparent = false,
}: TopNavProps): React.ReactNode {
  const containerClass = transparent
    ? 'h-11 flex-row items-center px-lg'
    : 'h-11 bg-nav flex-row items-center px-lg dark:border-b border-divider';

  return (
    <View className={containerClass}>
      {/* Left slot — custom leftAction overrides showBack */}
      <View className="min-w-11 items-start justify-center">
        {leftAction != null ? leftAction : showBack && (
          <BackButton fallback={backFallback} onPress={onBack} />
        )}
      </View>

      {/* Center — title or search input */}
      <View className="flex-1 items-center justify-center">
        {searchMode ? (
          <SearchBar
            value={searchValue}
            onChangeText={onSearchChange ?? (() => undefined)}
            placeholder={searchPlaceholder ?? 'Search...'}
          />
        ) : (
          <Text className="text-white font-semibold text-headline" accessibilityRole="header">
            {title}
          </Text>
        )}
      </View>

      {/* Right slot */}
      <View className="min-w-11 items-end justify-center">
        {rightAction}
      </View>
    </View>
  );
}
