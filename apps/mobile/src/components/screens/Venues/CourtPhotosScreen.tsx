/**
 * CourtPhotosScreen — photo gallery for a court.
 *
 * Renders:
 *   - TopNav with "+ Add" right-action that picks + uploads a photo
 *   - Court name + address bar (resolved by the hook)
 *   - Guidance text + photo count bar
 *   - 3-col square photo grid
 *   - Skeleton while loading
 *   - Empty state with CTA
 *   - Error state with retry
 *   - Pull-to-refresh
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
  RefreshControl,
  Alert,
  ActivityIndicator,
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

interface PhotoGridProps {
  readonly photos: readonly CourtPhoto[];
  readonly onAddPhoto: () => void;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
}

function PhotoGrid({
  photos,
  onAddPhoto,
  refreshing,
  onRefresh,
}: PhotoGridProps): React.ReactNode {
  if (photos.length === 0) {
    return (
      <View
        testID="court-photos-empty"
        className="flex-1 items-center justify-center py-16 px-8"
      >
        <Text className="text-[16px] font-semibold text-default mb-2 text-center">
          No Photos Yet
        </Text>
        <Text className="text-[14px] text-muted text-center mb-6">
          Add photos that help other players find and judge this court.
        </Text>
        <Pressable
          testID="court-photos-add-first-btn"
          onPress={onAddPhoto}
          accessibilityRole="button"
          accessibilityLabel="Add Photo"
          className="bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
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
          accessibilityLabel={item.caption ?? 'Court photo'}
        />
      )}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface CourtPhotosScreenProps {
  readonly idOrSlug: number | string;
}

export default function CourtPhotosScreen({
  idOrSlug,
}: CourtPhotosScreenProps): React.ReactNode {
  const {
    photos,
    header,
    isLoading,
    error,
    isRefreshing,
    isUploading,
    uploadError,
    onRefresh,
    onRetry,
    onUploadPhoto,
  } = useCourtPhotosScreen(idOrSlug);

  const handleAddPhoto = useCallback(() => {
    void hapticMedium();
    void onUploadPhoto().catch(() => {
      // Errors are surfaced via uploadError state; nothing to do here.
    });
  }, [onUploadPhoto]);

  // Surface upload failures via Alert so users see them immediately.
  React.useEffect(() => {
    if (uploadError != null) {
      Alert.alert('Upload Failed', uploadError.message, [{ text: 'OK' }]);
    }
  }, [uploadError]);

  const addButton = (
    <Pressable
      testID="court-photos-add-btn"
      onPress={handleAddPhoto}
      accessibilityRole="button"
      accessibilityLabel="Add photo"
      disabled={isUploading}
    >
      {isUploading ? (
        <ActivityIndicator
          testID="court-photos-upload-spinner"
          size="small"
          color="#0ea5a5"
        />
      ) : (
        <Text className="text-brand-teal font-semibold text-[15px]">+ Add</Text>
      )}
    </Pressable>
  );

  // --- Loading ---
  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
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
        className="flex-1 bg-page"
        edges={['top']}
        testID="court-photos-screen"
      >
        <TopNav title="Photos" showBack rightAction={addButton} />
        <View
          testID="court-photos-error"
          className="flex-1 items-center justify-center px-8"
        >
          <Text className="text-[16px] font-semibold text-default mb-2">
            Could Not Load Photos
          </Text>
          <Pressable
            testID="court-photos-retry-btn"
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Try Again"
            className="mt-4 bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
          >
            <Text className="text-white font-bold text-[15px]">Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="court-photos-screen"
    >
      <TopNav title="Photos" showBack rightAction={addButton} />

      {/* Court info bar */}
      <View
        testID="court-photos-header"
        className="px-4 py-3 border-b border-strong"
      >
        <Text className="text-[15px] font-semibold text-default">
          {header.name}
        </Text>
        {header.address != null && (
          <Text className="text-[13px] text-muted mt-0.5">
            {header.address}
          </Text>
        )}
      </View>

      {/* Guidance text */}
      <View className="px-4 py-2 border-b border-strong">
        <Text className="text-[13px] text-muted">
          Add photos that help other players find and judge this court.
        </Text>
      </View>

      {/* Photo count */}
      <View
        testID="court-photos-count-bar"
        className="px-4 py-2 border-b border-strong"
      >
        <Text className="text-[13px] font-medium text-default">
          {photos.length} photo{photos.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <PhotoGrid
        photos={photos}
        onAddPhoto={handleAddPhoto}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
      />
    </SafeAreaView>
  );
}
