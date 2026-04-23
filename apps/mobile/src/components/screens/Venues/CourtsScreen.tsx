/**
 * CourtsScreen — courts list with search, filter chips, and a map stub.
 *
 * Renders:
 *   - TopNav with integrated search mode
 *   - 180px map stub area with "View Full Map" link
 *   - Horizontal filter chips (Nearby/My Courts/Top Rated/Indoor/Outdoor/Lighted)
 *   - FlatList of CourtRow items
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

import TopNav from '@/components/ui/TopNav';
import { useCourtsScreen } from './useCourtsScreen';
import CourtRow from './CourtRow';
import CourtsSkeleton from './CourtsSkeleton';
import CourtsEmptyState from './CourtsEmptyState';
import CourtsErrorState from './CourtsErrorState';
import CourtsFilterBar from './CourtsFilterBar';
import type { Court } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Map stub
// ---------------------------------------------------------------------------

function MapStub(): React.ReactNode {
  return (
    <View
      testID="courts-map-stub"
      className="h-[180px] bg-teal-50 dark:bg-info-bg items-center justify-center border-b border-border dark:border-border-strong"
    >
      <Text className="text-[13px] text-text-muted dark:text-content-secondary mb-2">
        Map view
      </Text>
      <Pressable
        testID="courts-view-full-map-btn"
        accessibilityRole="button"
        accessibilityLabel="View Full Map"
        className="px-4 py-2 rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-border-strong active:opacity-80"
      >
        <Text className="text-[13px] font-medium text-primary dark:text-brand-teal">
          View Full Map
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
    <Text className="text-[13px] font-semibold text-text-muted dark:text-content-secondary uppercase tracking-wide px-4 py-2 bg-bg-page dark:bg-base">
      {text}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CourtsScreen(): React.ReactNode {
  const {
    courts,
    isLoading,
    error,
    isRefreshing,
    activeFilter,
    searchQuery,
    setActiveFilter,
    setSearchQuery,
    onRefresh,
    onRetry,
  } = useCourtsScreen();

  const handleClearFilter = useCallback(() => {
    setActiveFilter(null);
  }, [setActiveFilter]);

  // --- Loading skeleton ---
  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="courts-screen"
      >
        <TopNav
          title="Find Courts"
          showBack
          searchMode
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <CourtsSkeleton />
      </SafeAreaView>
    );
  }

  // --- Error ---
  if (error != null && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="courts-screen"
      >
        <TopNav
          title="Find Courts"
          showBack
          searchMode
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <CourtsErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: Court }) => <CourtRow court={item} />;

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="courts-screen"
    >
      <TopNav
        title="Find Courts"
        showBack
        searchMode
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <FlatList<Court>
        testID="courts-list"
        data={courts as Court[]}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <MapStub />
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
