import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Location } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import { BottomSheet, Button } from '@/components/ui';
import { BottomSheetSelect, type SelectOption } from '@/components/forms';
import FilterChipBar from '@/components/ui/FilterChipBar';
import type {
  DiscoverLevel,
  UseDiscoverPlayersResult,
} from '@/components/screens/FindPlayers/useDiscoverPlayers';
import {
  DISCOVERY_RADII,
  formatMetroLabel,
  type DiscoverRadius,
} from '@/components/screens/FindPlayers/discoveryLocation';

const LEVELS: readonly { readonly value: DiscoverLevel; readonly label: string }[] = [
  { value: 'Open', label: 'Open' },
  { value: 'AA', label: 'AA' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'beginner', label: 'Beginner' },
];

type LocationMode = 'all' | 'metro' | 'nearby';

type DiscoveryFilterPanelProps = Pick<
  UseDiscoverPlayersResult,
  | 'levelFilter'
  | 'onSetLevel'
  | 'locations'
  | 'locationsPending'
  | 'locationsError'
  | 'onRetryLocations'
  | 'metroFilterId'
  | 'nearMeEnabled'
  | 'nearMePending'
  | 'nearMeDenied'
  | 'nearMeUnavailable'
  | 'nearMeOriginLabel'
  | 'radiusMiles'
  | 'onSelectMetro'
  | 'onSelectNearMe'
  | 'onSetRadius'
  | 'onClearLocation'
>;

function appliedLocationMode(
  metroFilterId: string | null,
  nearMeEnabled: boolean,
): LocationMode {
  if (nearMeEnabled) return 'nearby';
  if (metroFilterId != null) return 'metro';
  return 'all';
}

function appliedFilterCount(
  level: DiscoverLevel | null,
  mode: LocationMode,
): number {
  return (level == null ? 0 : 1) + (mode === 'metro' ? 1 : mode === 'nearby' ? 2 : 0);
}

function selectedMetroLabel(
  locations: readonly Location[],
  locationId: string | null,
): string | null {
  const location = locations.find((item) => item.id === locationId);
  return location == null ? null : formatMetroLabel(location);
}

export default function DiscoveryFilterPanel({
  levelFilter,
  onSetLevel,
  locations,
  locationsPending,
  locationsError,
  onRetryLocations,
  metroFilterId,
  nearMeEnabled,
  nearMePending,
  nearMeDenied,
  nearMeUnavailable,
  nearMeOriginLabel,
  radiusMiles,
  onSelectMetro,
  onSelectNearMe,
  onSetRadius,
  onClearLocation,
}: DiscoveryFilterPanelProps): React.ReactNode {
  const [visible, setVisible] = useState(false);
  const [draftLevel, setDraftLevel] = useState<DiscoverLevel | null>(levelFilter);
  const [draftMode, setDraftMode] = useState<LocationMode>(() =>
    appliedLocationMode(metroFilterId, nearMeEnabled));
  const [draftMetroId, setDraftMetroId] = useState<string | null>(metroFilterId);
  const [draftRadius, setDraftRadius] = useState<DiscoverRadius>(radiusMiles);
  const triggerRef = useRef<React.ElementRef<typeof Pressable>>(null);

  const currentMode = appliedLocationMode(metroFilterId, nearMeEnabled);
  const activeCount = appliedFilterCount(levelFilter, currentMode);
  const metroLabel = selectedMetroLabel(locations, metroFilterId);
  const summary = [
    levelFilter == null
      ? null
      : LEVELS.find((item) => item.value === levelFilter)?.label ?? levelFilter,
    currentMode === 'metro' ? metroLabel ?? 'Metro' : null,
    currentMode === 'nearby'
      ? `Near ${nearMeOriginLabel ?? 'Me'} · ${radiusMiles} mi`
      : null,
  ].filter((value): value is string => value != null);

  const metroOptions = useMemo<readonly SelectOption[]>(
    () => locations.map((location) => ({
      value: location.id,
      label: formatMetroLabel(location),
      searchText: [location.name, location.city, location.state]
        .filter(Boolean)
        .join(' '),
    })),
    [locations],
  );

  const open = useCallback(() => {
    setDraftLevel(levelFilter);
    setDraftMode(currentMode);
    setDraftMetroId(metroFilterId);
    setDraftRadius(radiusMiles);
    setVisible(true);
  }, [currentMode, levelFilter, metroFilterId, radiusMiles]);

  const clearDraft = useCallback(() => {
    setDraftLevel(null);
    setDraftMode('all');
    setDraftMetroId(null);
    setDraftRadius(25);
  }, []);

  const apply = useCallback(() => {
    onSetLevel(draftLevel);
    onSetRadius(draftRadius);
    if (draftMode === 'nearby') {
      onSelectNearMe();
    } else if (draftMode === 'metro' && draftMetroId != null) {
      onSelectMetro(draftMetroId);
    } else {
      onClearLocation();
    }
    setVisible(false);
  }, [
    draftLevel,
    draftMetroId,
    draftMode,
    draftRadius,
    onClearLocation,
    onSelectMetro,
    onSelectNearMe,
    onSetLevel,
    onSetRadius,
  ]);

  return (
    <>
      <View className="border-b border-divider bg-surface px-4 py-2">
        <Pressable
          ref={triggerRef}
          testID="discover-filter-button"
          accessibilityRole="button"
          accessibilityLabel={`Filters, ${activeCount} active`}
          onPress={open}
          className="min-h-touch flex-row items-center justify-between rounded-lg border border-divider bg-surface px-4"
        >
          <View className="min-w-0 flex-1 pr-3">
            <AppText className="text-sm font-bold text-default">
              Filters{activeCount > 0 ? ` (${activeCount})` : ''}
            </AppText>
            {summary.length > 0 && (
              <AppText numberOfLines={1} className="text-caption text-muted">
                {summary.join(' · ')}
              </AppText>
            )}
          </View>
          <AppText className="text-sm font-bold text-brand-teal">Edit</AppText>
        </Pressable>
        {nearMePending && (
          <AppText accessibilityLiveRegion="polite" className="mt-2 text-caption text-muted">
            Finding your nearest metro…
          </AppText>
        )}
        {nearMeDenied && (
          <AppText accessibilityLiveRegion="polite" className="mt-2 text-caption text-danger">
            Location is unavailable. Edit filters to choose a metro.
          </AppText>
        )}
        {nearMeUnavailable && (
          <AppText accessibilityLiveRegion="polite" className="mt-2 text-caption text-danger">
            Nearby search is unavailable. Edit filters to retry or choose a metro.
          </AppText>
        )}
      </View>

      <BottomSheet
        visible={visible}
        onClose={() => setVisible(false)}
        returnFocusRef={triggerRef}
        testID="discover-filter-sheet"
        accessibilityLabel="Player filters"
        className="max-h-[88%]"
      >
        <View className="flex-row items-center justify-between px-lg pb-sm">
          <AppText accessibilityRole="header" className="text-title3 font-bold text-default">
            Filters
          </AppText>
          <Pressable
            testID="discover-filter-clear-all"
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            onPress={clearDraft}
            className="min-h-touch justify-center px-2"
          >
            <AppText className="text-sm font-bold text-brand-teal">Clear All</AppText>
          </Pressable>
        </View>
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerClassName="gap-lg pb-xl"
          keyboardShouldPersistTaps="always"
        >
          <View className="gap-2">
            <AppText className="px-lg text-caption font-bold uppercase tracking-wide text-muted">
              Level
            </AppText>
            <FilterChipBar<'any' | DiscoverLevel>
              testID="discover-sheet-level-filters"
              accessibilityLabel="Player level filter"
              items={[
                { value: 'any', label: 'Any Level', testID: 'discover-sheet-level-any' },
                ...LEVELS.map((item) => ({
                  ...item,
                  testID: `discover-sheet-level-${item.value}`,
                })),
              ]}
              value={draftLevel ?? 'any'}
              onValueChange={(value) => setDraftLevel(value === 'any' ? null : value)}
            />
          </View>

          <View className="gap-3 px-lg">
            <AppText className="text-caption font-bold uppercase tracking-wide text-muted">
              Location
            </AppText>
            <FilterChipBar<LocationMode>
              testID="discover-sheet-location-mode"
              accessibilityLabel="Location filter mode"
              className="-mx-4"
              items={[
                { value: 'all', label: 'Anywhere', testID: 'discover-sheet-location-all' },
                { value: 'metro', label: 'Metro', testID: 'discover-sheet-location-metro' },
                { value: 'nearby', label: 'Near Me', testID: 'discover-sheet-location-nearby' },
              ]}
              value={draftMode}
              onValueChange={setDraftMode}
            />

            {draftMode === 'metro' && (
              <BottomSheetSelect
                title="Choose a metro"
                placeholder={locationsPending ? 'Loading metros…' : 'Select metro'}
                options={metroOptions}
                value={draftMetroId ?? ''}
                onChange={(value) => setDraftMetroId(value || null)}
                loading={locationsPending}
                disabled={locationsPending}
                searchable
                searchPlaceholder="Search metros"
                testID="discover-sheet-metro-select"
              />
            )}

            {draftMode === 'nearby' && (
              <View className="gap-2">
                <AppText className="text-caption text-muted">
                  Location access is requested only after you apply Near Me.
                </AppText>
                <FilterChipBar<`${DiscoverRadius}`>
                  testID="discover-sheet-radius-filters"
                  accessibilityLabel="Distance radius"
                  className="-mx-4"
                  items={DISCOVERY_RADII.map((radius) => ({
                    value: String(radius) as `${DiscoverRadius}`,
                    label: `${radius} mi`,
                    testID: `discover-sheet-radius-${radius}`,
                  }))}
                  value={String(draftRadius) as `${DiscoverRadius}`}
                  onValueChange={(radius) =>
                    setDraftRadius(Number(radius) as DiscoverRadius)}
                />
              </View>
            )}

            {locationsError != null && (
              <View className="flex-row flex-wrap items-center gap-2">
                <AppText className="text-caption text-danger">
                  Metros could not be loaded.
                </AppText>
                <Pressable
                  testID="discover-sheet-location-retry"
                  accessibilityRole="button"
                  accessibilityLabel="Retry metro list"
                  onPress={onRetryLocations}
                  className="min-h-touch justify-center"
                >
                  <AppText className="text-caption font-bold text-brand-teal">Retry</AppText>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
        <View className="border-t border-divider px-lg pb-xl pt-md">
          <Button
            title="Apply Filters"
            onPress={apply}
            testID="discover-filter-apply"
            disabled={draftMode === 'metro' && draftMetroId == null}
          />
        </View>
      </BottomSheet>
    </>
  );
}
