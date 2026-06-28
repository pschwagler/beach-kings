/**
 * CourtsScreen — courts list/map with search, filter chips, and a map toggle.
 *
 * Renders:
 *   - TopNav with integrated search mode
 *   - List/Map toggle bar (mirrors the web CourtDirectoryClient toggle)
 *   - In list mode:
 *     - 180px map stub area with a "View Full Map" link that switches to map mode
 *     - Horizontal filter chips (Nearby/My Courts/Top Rated/Indoor/Outdoor/Lighted)
 *     - FlatList of CourtRow items
 *   - In map mode:
 *     - Full-screen CourtsMapView; tapping a marker navigates to its detail screen
 *   - Skeleton while loading
 *   - Empty state (no courts / no location)
 *   - Error state with retry
 *   - Pull-to-refresh
 *
 * Wireframe ref: courts.html
 */

import React, { useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import { routes } from '@/lib/navigation';
import { hapticLight } from '@/utils/haptics';
import { useCourtsScreen } from './useCourtsScreen';
import CourtRow from './CourtRow';
import CourtsSkeleton from './CourtsSkeleton';
import CourtsEmptyState from './CourtsEmptyState';
import CourtsErrorState from './CourtsErrorState';
import CourtsFilterBar from './CourtsFilterBar';
import CourtsMapView from './CourtsMapView';
import CourtsMapPreview from './CourtsMapPreview';
import type { Court } from '@beach-kings/shared';
import type { CourtsViewMode } from './useCourtsScreen';

// ---------------------------------------------------------------------------
// View-mode toggle
// ---------------------------------------------------------------------------

interface ViewModeToggleProps {
  readonly viewMode: CourtsViewMode;
  readonly onToggle: (mode: CourtsViewMode) => void;
}

/**
 * Pill-shaped toggle that switches between List and Map view modes.
 * Mirrors the court-view-toggle on the web CourtDirectoryClient.
 */
function ViewModeToggle({
  viewMode,
  onToggle,
}: ViewModeToggleProps): React.ReactNode {
  const handleList = useCallback(() => {
    void hapticLight();
    onToggle('list');
  }, [onToggle]);

  const handleMap = useCallback(() => {
    void hapticLight();
    onToggle('map');
  }, [onToggle]);

  return (
    <View
      testID="courts-view-toggle"
      className="flex-row mx-4 my-2 rounded-lg bg-surface border border-strong overflow-hidden"
    >
      <Pressable
        testID="courts-view-toggle-list"
        onPress={handleList}
        accessibilityRole="button"
        accessibilityLabel="List view"
        className={`flex-1 py-2 items-center ${
          viewMode === 'list' ? 'bg-brand-teal' : 'bg-surface'
        } active:opacity-80`}
      >
        <Text
          className={`text-[13px] font-semibold ${
            viewMode === 'list' ? 'text-inverse' : 'text-muted'
          }`}
        >
          List
        </Text>
      </Pressable>

      <Pressable
        testID="courts-view-toggle-map"
        onPress={handleMap}
        accessibilityRole="button"
        accessibilityLabel="Map view"
        className={`flex-1 py-2 items-center ${
          viewMode === 'map' ? 'bg-brand-teal' : 'bg-surface'
        } active:opacity-80`}
      >
        <Text
          className={`text-[13px] font-semibold ${
            viewMode === 'map' ? 'text-inverse' : 'text-muted'
          }`}
        >
          Map
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ text }: { text: string }): React.ReactNode {
  return (
    <Text className="text-[13px] font-semibold text-muted uppercase tracking-wide px-4 py-2 bg-page">
      {text}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CourtsScreen(): React.ReactNode {
  const router = useRouter();

  const {
    courts,
    isLoading,
    error,
    isRefreshing,
    activeFilter,
    searchQuery,
    viewMode,
    userLocation,
    setActiveFilter,
    setSearchQuery,
    setViewMode,
    onRefresh,
    onRetry,
  } = useCourtsScreen();

  const handleClearFilter = useCallback(() => {
    setActiveFilter(null);
  }, [setActiveFilter]);

  const handleViewFullMap = useCallback(() => {
    void hapticLight();
    setViewMode('map');
  }, [setViewMode]);

  const handleSelectCourt = useCallback(
    (court: Court) => {
      void hapticLight();
      router.push(routes.court(court.id));
    },
    [router],
  );

  // Shared TopNav rendered in every branch
  const topNav = (
    <TopNav
      title="Find Courts"
      showBack
      backFallback={routes.home()}
      searchMode
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
    />
  );

  // --- Loading skeleton ---
  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="courts-screen"
      >
        {topNav}
        <CourtsSkeleton />
      </SafeAreaView>
    );
  }

  // --- Error ---
  if (error != null && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="courts-screen"
      >
        {topNav}
        <CourtsErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  // --- Map mode ---
  if (viewMode === 'map') {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="courts-screen"
      >
        {topNav}
        <ViewModeToggle viewMode={viewMode} onToggle={setViewMode} />
        <CourtsMapView
          courts={courts}
          onSelectCourt={handleSelectCourt}
          userLocation={userLocation}
        />
      </SafeAreaView>
    );
  }

  // --- List mode (default) ---
  const renderItem = ({ item }: { item: Court }) => <CourtRow court={item} />;

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="courts-screen"
    >
      {topNav}

      <FlatList<Court>
        testID="courts-list"
        data={courts as Court[]}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <ViewModeToggle viewMode={viewMode} onToggle={setViewMode} />
            <CourtsMapPreview
              courts={courts}
              userLocation={userLocation}
              onViewFullMap={handleViewFullMap}
            />
            <CourtsFilterBar
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
            />
            <SectionLabel text="Nearby Courts" />
          </>
        }
        ListEmptyComponent={
          <CourtsEmptyState
            hasActiveFilter={activeFilter != null}
            onClearFilter={activeFilter != null ? handleClearFilter : undefined}
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      />
    </SafeAreaView>
  );
}
