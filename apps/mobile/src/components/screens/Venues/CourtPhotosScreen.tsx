/**
 * CourtPhotosScreen — photo gallery for a court.
 *
 * Renders:
 *   - TopNav with "+ Add" right-action
 *   - Court name + address bar
 *   - Photo count bar
 *   - 3-col square photo grid
 *   - Skeleton while loading
 *   - Empty state
 *   - Error state
 *
 * Wireframe ref: court-photos.html
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useCourtPhotosScreen } from './useCourtPhotosScreen';
import { hapticMedium } from '@/utils/haptics';
import type { CourtPhoto } from '@beach-kings/shared';

const NUM_COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_SIZE = Math.floor(SCREEN_WIDTH / NUM_COLUMNS) - 1;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PhotoSkeleton(): React.ReactNode {
  return (
    <View testID="court-photos-loading" className="flex-row flex-wrap">
      {Array.from({ length: 9 }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={i} style={{ margin: 0.5 }}>
          <LoadingSkeleton width={PHOTO_SIZE} height={PHOTO_SIZE} borderRadius={0} />
        </View>
      ))}
    </View>
  );
}

function PhotoGrid({
  photos,
  onAddPhoto,
}: {
  photos: readonly CourtPhoto[];
  onAddPhoto: () => void;
}): React.ReactNode {
  if (photos.length === 0) {
    return (
      <View
        testID="court-photos-empty"
        className="flex-1 items-center justify-center py-16 px-8"
      >
        <Text className="text-[16px] font-semibold text-text-default dark:text-content-primary mb-2 text-center">
          No Photos Yet
        </Text>
        <Text className="text-[14px] text-text-muted dark:text-content-secondary text-center mb-6">
          Add photos that help other players find and judge this court.
        </Text>
        <Pressable
          testID="court-photos-add-first-btn"
          onPress={onAddPhoto}
          accessibilityRole="button"
          accessibilityLabel="Add Photo"
          className="bg-accent dark:bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
        >
          <Text className="text-white font-bold text-[15px]">Add Photo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList<CourtPhoto>
      testID="court-photos-grid"
      data={photos as CourtPhoto[]}
      keyExtractor={(item) => String(item.id)}
      numColumns={NUM_COLUMNS}
      renderItem={({ item }) => (
        <Image
          key={item.id}
          source={{ uri: item.url }}
          style={{
            width: PHOTO_SIZE,
            height: PHOTO_SIZE,
            margin: 0.5,
            backgroundColor: '#e5e7eb',
          }}
          accessibilityIgnoresInvertColors
          accessibilityLabel="Court photo"
        />
      )}
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface CourtPhotosScreenProps {
  readonly idOrSlug: number | string;
  readonly courtName?: string;
  readonly courtAddress?: string;
}

export default function CourtPhotosScreen({
  idOrSlug,
  courtName = 'Court Photos',
  courtAddress,
}: CourtPhotosScreenProps): React.ReactNode {
  const { photos, isLoading, error, onRetry } = useCourtPhotosScreen(idOrSlug);

  const handleAddPhoto = useCallback(() => {
    void hapticMedium();
    // TODO(backend): launch image picker → POST /api/courts/:id/photos
  }, []);

  const addButton = (
    <Pressable
      testID="court-photos-add-btn"
      onPress={handleAddPhoto}
      accessibilityRole="button"
      accessibilityLabel="Add photo"
    >
      <Text className="text-primary dark:text-brand-teal font-semibold text-[15px]">
        + Add
      </Text>
    </Pressable>
  );

  // --- Loading ---
  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="court-photos-screen"
      >
        <TopNav title="Photos" showBack rightAction={addButton} />
        <PhotoSkeleton />
      </SafeAreaView>
    );
  }

  // --- Error ---
  if (error != null) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="court-photos-screen"
      >
        <TopNav title="Photos" showBack rightAction={addButton} />
        <View
          testID="court-photos-error"
          className="flex-1 items-center justify-center px-8"
        >
          <Text className="text-[16px] font-semibold text-text-default dark:text-content-primary mb-2">
            Could Not Load Photos
          </Text>
          <Pressable
            testID="court-photos-retry-btn"
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Try Again"
            className="mt-4 bg-accent dark:bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
          >
            <Text className="text-white font-bold text-[15px]">Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="court-photos-screen"
    >
      <TopNav title="Photos" showBack rightAction={addButton} />

      {/* Court info bar */}
      <View
        testID="court-photos-header"
        className="px-4 py-3 border-b border-border dark:border-border-strong"
      >
        <Text className="text-[15px] font-semibold text-text-default dark:text-content-primary">
          {courtName}
        </Text>
        {courtAddress != null && (
          <Text className="text-[13px] text-text-muted dark:text-content-secondary mt-0.5">
            {courtAddress}
          </Text>
        )}
      </View>

      {/* Guidance text */}
      <View className="px-4 py-2 border-b border-border dark:border-border-strong">
        <Text className="text-[13px] text-text-muted dark:text-content-secondary">
          Add photos that help other players find and judge this court.
        </Text>
      </View>

      {/* Photo count */}
      <View
        testID="court-photos-count-bar"
        className="px-4 py-2 border-b border-border dark:border-border-strong"
      >
        <Text className="text-[13px] font-medium text-text-default dark:text-content-primary">
          {photos.length} photo{photos.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <PhotoGrid photos={photos} onAddPhoto={handleAddPhoto} />
    </SafeAreaView>
  );
}
