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
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from './icons';
import SearchBar from './SearchBar';

interface TopNavProps {
  readonly title: string;
  readonly showBack?: boolean;
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
  rightAction,
  searchMode = false,
  searchValue = '',
  onSearchChange,
  searchPlaceholder,
  transparent = false,
}: TopNavProps): React.ReactNode {
  const router = useRouter();

  const containerClass = transparent
    ? 'h-11 flex-row items-center px-lg'
    : 'h-11 bg-nav dark:bg-nav-dark flex-row items-center px-lg dark:border-b dark:border-border-subtle';

  return (
    <View className={containerClass}>
      {/* Left slot */}
      <View className="w-11 items-start justify-center">
        {showBack && (
          <Pressable
            className="min-w-touch min-h-touch items-center justify-center"
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeftIcon size={20} color="#ffffff" />
          </Pressable>
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
      <View className="w-11 items-end justify-center">
        {rightAction}
      </View>
    </View>
  );
}
