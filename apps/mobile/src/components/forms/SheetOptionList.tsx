import React, { useMemo, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import AppText from '@/components/ui/AppText';
import { CheckIcon, SearchIcon } from '@/components/ui/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { usePaletteColors } from '@/theme/usePaletteColors';

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
  const palette = usePaletteColors();
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
    <View className="px-lg pb-xl pt-sm flex-shrink">
      <AppText className="text-footnote font-semibold text-muted uppercase tracking-wider mb-md">
        {title}
      </AppText>

      {searchable ? (
        <View className="flex-row items-center border border-divider rounded-lg px-md mb-md h-10 bg-surface">
          <SearchIcon size={16} color={palette.textTertiary} />
          <TextInput
            className="flex-1 ml-sm"
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={palette.textTertiary}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            style={{
              color: palette.textDefault,
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
            <AppText className="text-body text-muted">
              {searchable && query
                ? 'No matches'
                : (emptyMessage ?? 'No options')}
            </AppText>
          )}
        </View>
      ) : (
        <ScrollView
          style={{ maxHeight: 420, flexShrink: 1 }}
          keyboardShouldPersistTaps="always"
        >
          {filtered.map((opt) => {
            const selected = opt.value === selectedValue;
            return (
              <Pressable
                key={opt.value}
                className={`flex-row items-center justify-between py-md px-md rounded-lg ${
                  selected ? 'bg-info-tint' : 'bg-transparent'
                }`}
                onPress={() => onSelect(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.label}
              >
                <View className="flex-1">
                  <AppText
                    className={`text-body font-medium ${
                      selected ? 'text-brand-teal' : 'text-default'
                    }`}
                  >
                    {opt.label}
                  </AppText>
                  {opt.sublabel ? (
                    <AppText className="text-caption text-muted mt-xxs">
                      {opt.sublabel}
                    </AppText>
                  ) : null}
                </View>
                {selected ? (
                  <CheckIcon size={18} color={palette.brandTeal} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
