/**
 * City autocomplete with inline suggestion list.
 *
 * Calls the backend Geoapify proxy (`GET /api/geocode/autocomplete`) and
 * renders suggestions directly below the input so the keyboard stays up
 * while the user browses. Selecting a suggestion fires `onCitySelect`
 * with `{ city, state, lat, lon }` so a caller (e.g. the onboarding form)
 * can auto-pick the closest location.
 *
 * Mirrors `apps/web/src/components/ui/CityAutocomplete.tsx` — including
 * the NYC district-as-city fix and the `city|state` de-duplication.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  View,
  Pressable,
  Text,
  ActivityIndicator,
  TextInput,
  Keyboard,
} from 'react-native';
import { Input } from '@/components/ui';
import { api } from '@/lib/api';
import useDebounce from '@/hooks/useDebounce';

const MIN_QUERY_LENGTH = 2;

interface GeoFeature {
  readonly properties: {
    readonly city?: string;
    readonly name?: string;
    readonly district?: string;
    readonly suburb?: string;
    readonly state?: string;
    readonly state_code?: string;
  };
  readonly geometry: { readonly coordinates: readonly [number, number] };
}

export interface CitySuggestion {
  readonly city: string;
  readonly state: string;
  readonly formatted: string;
  readonly lat: number;
  readonly lon: number;
}

interface CityAutocompleteProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onCitySelect: (suggestion: CitySuggestion) => void;
  readonly onBlur?: () => void;
  readonly placeholder?: string;
  readonly error?: boolean;
  readonly testID?: string;
}

function normalizeFeature(feature: GeoFeature): CitySuggestion | null {
  const props = feature.properties ?? {};
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length !== 2) return null;

  let city = props.city || props.name || '';
  const district = props.district || props.suburb || '';
  // NYC edge case: Geoapify returns city="New York" for all 5 boroughs.
  if (city === 'New York' && district && district !== 'Manhattan') {
    city = district;
  }
  const state = props.state || props.state_code || '';
  if (!city) return null;

  return {
    city,
    state,
    formatted: state ? `${city}, ${state}` : city,
    lat: coords[1],
    lon: coords[0],
  };
}

function dedupeSuggestions(
  suggestions: readonly CitySuggestion[],
): readonly CitySuggestion[] {
  const seen = new Set<string>();
  const out: CitySuggestion[] = [];
  for (const s of suggestions) {
    const key = `${s.city}|${s.state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

const CityAutocomplete = forwardRef<TextInput, CityAutocompleteProps>(
  function CityAutocomplete(
    {
      value,
      onChangeText,
      onCitySelect,
      onBlur,
      placeholder = 'Start typing your city...',
      error = false,
      testID,
    },
    ref,
  ) {
    const [suggestions, setSuggestions] = useState<readonly CitySuggestion[]>(
      [],
    );
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const debouncedValue = useDebounce(value, 300);
    const lastSelectedRef = useRef<string | null>(null);

    const fetchSuggestions = useCallback(async (searchText: string) => {
      setIsLoading(true);
      try {
        const data = await api.getCityAutocomplete(searchText);
        const features: readonly GeoFeature[] = data?.features ?? [];
        const normalized = features
          .map(normalizeFeature)
          .filter((s): s is CitySuggestion => s !== null);
        const unique = dedupeSuggestions(normalized);
        setSuggestions(unique);
        setShowSuggestions(unique.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    }, []);

    useEffect(() => {
      const trimmed = debouncedValue.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      // Skip refetch if the user just picked a suggestion whose text matches.
      if (lastSelectedRef.current === trimmed) return;
      fetchSuggestions(trimmed);
    }, [debouncedValue, fetchSuggestions]);

    const handleSelect = useCallback(
      (suggestion: CitySuggestion) => {
        lastSelectedRef.current = suggestion.formatted;
        onChangeText(suggestion.formatted);
        setSuggestions([]);
        setShowSuggestions(false);
        onCitySelect(suggestion);
        Keyboard.dismiss();
      },
      [onChangeText, onCitySelect],
    );

    const handleChangeText = useCallback(
      (next: string) => {
        // Typing after selection invalidates the lock.
        if (lastSelectedRef.current && lastSelectedRef.current !== next) {
          lastSelectedRef.current = null;
        }
        onChangeText(next);
      },
      [onChangeText],
    );

    const handleSubmitEditing = useCallback(() => {
      // returnKeyType="search" — user pressed Search: dismiss keyboard but
      // leave the suggestion list visible for tap selection.
      Keyboard.dismiss();
    }, []);

    return (
      <View>
        <View>
          <Input
            ref={ref}
            value={value}
            onChangeText={handleChangeText}
            onBlur={onBlur}
            placeholder={placeholder}
            autoCapitalize="words"
            autoComplete="postal-address-locality"
            textContentType="addressCity"
            returnKeyType="search"
            onSubmitEditing={handleSubmitEditing}
            blurOnSubmit={false}
            className={error ? 'border-red-500 dark:border-red-500' : ''}
          />
          {isLoading ? (
            <View
              className="absolute right-md top-0 h-12 justify-center"
              pointerEvents="none"
            >
              <ActivityIndicator size="small" />
            </View>
          ) : null}
        </View>

        {showSuggestions && suggestions.length > 0 ? (
          <View
            testID={testID ? `${testID}-suggestions` : undefined}
            className="mt-xs border border-border dark:border-border-strong rounded-lg bg-white dark:bg-elevated overflow-hidden"
          >
            {suggestions.map((s) => (
              <Pressable
                key={`${s.city}|${s.state}|${s.lat}|${s.lon}`}
                onPress={() => handleSelect(s)}
                className="px-md py-sm border-b border-border dark:border-border-strong active:bg-gray-50 dark:active:bg-dark-surface"
                accessibilityRole="button"
                accessibilityLabel={`Select ${s.formatted}`}
                testID={
                  testID ? `${testID}-suggestion-${s.city}-${s.state}` : undefined
                }
              >
                <Text className="text-body text-primary dark:text-content-primary">
                  {s.city}
                </Text>
                {s.state ? (
                  <Text className="text-caption text-gray-500 dark:text-content-secondary">
                    {s.state}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  },
);

export default CityAutocomplete;
