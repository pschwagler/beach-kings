/**
 * SearchBar — search input with magnifying glass icon and clear button.
 * 44px height, rounded gray background, dark mode support.
 */

import React from 'react';
import { View, TextInput, Pressable } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface SearchBarProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
  readonly onClear?: () => void;
  readonly className?: string;
  readonly compact?: boolean;
}

function SearchIcon({ color }: { color: string }): React.ReactNode {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={8} stroke={color} strokeWidth={2} />
      <Path d="M21 21l-4.35-4.35" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function ClearIcon({ color }: { color: string }): React.ReactNode {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  onClear,
  className = '',
  compact = false,
}: SearchBarProps): React.ReactNode {
  const { isDark } = useTheme();
  const palette = usePaletteColors();
  const iconColor = palette.textTertiary;
  const textColor = palette.textDefault;

  const handleClear = () => {
    onChangeText('');
    onClear?.();
  };

  return (
    <View
      className={`flex-row items-center ${compact ? 'h-9 rounded-lg' : 'h-11 rounded-xl'} px-3 bg-elevated gap-2 ${className}`}
    >
      <SearchIcon color={iconColor} />
      <TextInput
        className="flex-1 text-sm"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={iconColor}
        keyboardAppearance={isDark ? 'dark' : 'light'}
        style={{ color: textColor }}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <Pressable
          onPress={handleClear}
          hitSlop={12}
          accessibilityLabel="Clear search"
          accessibilityRole="button"
        >
          <ClearIcon color={iconColor} />
        </Pressable>
      )}
    </View>
  );
}
