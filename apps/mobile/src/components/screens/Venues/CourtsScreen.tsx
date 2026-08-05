/**
 * CourtsScreen — courts list/map with search, filter chips, and a map toggle.
 *
 * Renders:
 *   - TopNav with integrated search mode
 *   - List/Map toggle bar (mirrors the web CourtDirectoryClient toggle)
 *   - In list mode:
 *     - Horizontal filter chips (Nearby/My Courts/Top Rated/Indoor/Outdoor/Lighted)
 *     - FlatList of CourtRow items
 *   - In map mode:
 *     - Full-screen clustered map; tapping a court marker opens its detail screen
 *   - Skeleton while loading
 *   - Empty state (no courts / no location)
 *   - Error state with retry
 *   - Pull-to-refresh
 *
 * Wireframe ref: courts.html
 */

import React, { useCallback } from 'react';
import { View, FlatList, RefreshControl, Pressable } from 'react-native';
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
import AppText from '@/components/ui/AppText';
import type { Court } from '@beach-kings/shared';
import type { CourtsViewMode } from './useCourtsScreen';
import { getCourtFilterPresentation } from './courtFilters';

// ---------------------------------------------------------------------------
// View-mode toggle
// ---------------------------------------------------------------------------

interface ViewModeToggleProps {
  readonly viewMode: CourtsViewMode;
  readonly onToggle: (mode: CourtsViewMode) => void;
}

/**
 * Directory-specific compact tabs. The row keeps 44-point targets while the
 * selected teal surface is inset from the control bounds.
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
      accessibilityRole="tablist"
      className="h-11 mx-4 my-1 flex-row rounded-lg bg-elevated border border-divider p-1"
    >
      {(['list', 'map'] as const).map((mode) => {
        const selected = viewMode === mode;
        const label = mode === 'list' ? 'List' : 'Map';
        return (
          <Pressable
            key={mode}
            testID={`courts-view-toggle-${mode}`}
            onPress={mode === 'list' ? handleList : handleMap}
            accessibilityRole="tab"
            accessibilityLabel={`${label} view`}
            accessibilityState={{ selected }}
            className={`flex-1 items-center justify-center rounded-md ${selected ? 'bg-brand-teal' : 'bg-transparent'}`}
          >
            <AppText className={`text-sm font-medium ${selected ? 'text-on-brand-teal' : 'text-muted'}`}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section label
// ---------------------------------------------------------------------------

function SectionLabel({ text }: { text: string }): React.ReactNode {
  return (
    <AppText
      testID="courts-section-label"
      className="text-[13px] font-semibold text-muted uppercase tracking-wide px-4 py-2 bg-page"
    >
      {text}
    </AppText>
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
    preferredMapRegion,
    isCatalogEmpty,
    setActiveFilter,
    setSearchQuery,
    clearSearch,
    setViewMode,
    onRefresh,
    onRetry,
  } = useCourtsScreen();

  const handleClearFilter = useCallback(() => {
    setActiveFilter(null);
  }, [setActiveFilter]);

  const handleSelectCourt = useCallback(
    (court: Court) => {
      void hapticLight();
      router.push(routes.court(court.id));
    },
    [router],
  );
  const filterPresentation = getCourtFilterPresentation(activeFilter);

  // Shared TopNav rendered in every branch
  const topNav = (
    <TopNav
      title="Find Courts"
      showBack
      searchMode
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search courts"
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
        <CourtsFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />
        {courts.length === 0 ? (
          <CourtsEmptyState
            activeFilter={activeFilter}
            searchQuery={searchQuery}
            isCatalogEmpty={isCatalogEmpty}
            onClearSearch={clearSearch}
            onClearFilter={activeFilter != null ? handleClearFilter : undefined}
          />
        ) : (
          <CourtsMapView
            courts={courts}
            onSelectCourt={handleSelectCourt}
            userLocation={userLocation}
            preferredRegion={preferredMapRegion}
          />
        )}
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
            <CourtsFilterBar
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
            />
            <SectionLabel text={filterPresentation.sectionLabel} />
          </>
        }
        ListEmptyComponent={
          <CourtsEmptyState
            activeFilter={activeFilter}
            searchQuery={searchQuery}
            isCatalogEmpty={isCatalogEmpty}
            onClearSearch={clearSearch}
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
