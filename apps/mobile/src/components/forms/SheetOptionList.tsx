import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { CheckIcon, SearchIcon } from '@/components/ui/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { colors, darkColors } from '@beach-kings/shared/tokens';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly sublabel?: string;
  /** Extra tokens appended to the search haystack (e.g. full state name). */
  readonly searchText?: string;
}

interface SheetOptionListProps {
  readonly title: string;
  readonly options: readonly SelectOption[];
  readonly selectedValue: string;
  readonly onSelect: (value: string) => void;
  readonly emptyMessage?: string;
  readonly loading?: boolean;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export default function SheetOptionList({
  title,
  options,
  selectedValue,
  onSelect,
  emptyMessage,
  loading = false,
  searchable = false,
  searchPlaceholder = 'Search',
}: SheetOptionListProps): React.ReactNode {
  const { isDark } = useTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo<readonly SelectOption[]>(() => {
    if (!searchable) return options;
    const q = normalize(query);
    if (!q) return options;
    return options.filter((opt) => {
      const haystack = normalize(
        [opt.label, opt.sublabel ?? '', opt.searchText ?? ''].join(' '),
      );
      return haystack.includes(q);
    });
  }, [options, query, searchable]);

  return (
    <View className="px-lg pb-xl pt-sm">
      <Text className="text-footnote font-semibold text-gray-500 dark:text-content-secondary uppercase tracking-wider mb-md">
        {title}
      </Text>

      {searchable ? (
        <View className="flex-row items-center border border-border dark:border-border-strong rounded-lg px-md mb-md h-10 bg-white dark:bg-elevated">
          <SearchIcon
            size={16}
            color={isDark ? darkColors.textTertiary : colors.textTertiary}
          />
          <TextInput
            className="flex-1 ml-sm"
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={
              isDark ? darkColors.textTertiary : colors.textTertiary
            }
            keyboardAppearance={isDark ? 'dark' : 'light'}
            style={{
              color: isDark ? darkColors.textPrimary : colors.textPrimary,
              fontSize: 15,
              paddingVertical: 0,
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={searchPlaceholder}
          />
        </View>
      ) : null}

      {filtered.length === 0 ? (
        <View className="py-lg items-center">
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text className="text-body text-gray-500 dark:text-content-secondary">
              {searchable && query
                ? 'No matches'
                : (emptyMessage ?? 'No options')}
            </Text>
          )}
        </View>
      ) : (
        <ScrollView
          style={{ maxHeight: 420 }}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.map((opt) => {
            const selected = opt.value === selectedValue;
            return (
              <Pressable
                key={opt.value}
                className={`flex-row items-center justify-between py-md px-md rounded-lg ${
                  selected
                    ? 'bg-primary/10 dark:bg-brand-teal/10'
                    : 'bg-transparent'
                }`}
                onPress={() => onSelect(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.label}
              >
                <View className="flex-1">
                  <Text
                    className={`text-body font-medium ${
                      selected
                        ? 'text-primary dark:text-brand-teal'
                        : 'text-primary dark:text-content-primary'
                    }`}
                  >
                    {opt.label}
                  </Text>
                  {opt.sublabel ? (
                    <Text className="text-caption text-gray-500 dark:text-content-secondary mt-xxs">
                      {opt.sublabel}
                    </Text>
                  ) : null}
                </View>
                {selected ? <CheckIcon size={18} color="#2a7d9c" /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
