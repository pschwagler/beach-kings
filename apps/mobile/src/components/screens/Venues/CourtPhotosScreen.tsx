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

import React, { useCallback, useState } from 'react';
import AppText from '@/components/ui/AppText';
import {
  View,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { useCourtPhotosScreen } from './useCourtPhotosScreen';
import { hapticMedium } from '@/utils/haptics';
import type { CourtPhoto } from '@beach-kings/shared';
import { usePaletteColors } from '@/theme/usePaletteColors';
import ReportSheet from '@/components/moderation/ReportSheet';

const NUM_COLUMNS = 3;

export function getCourtPhotoSize(windowWidth: number): number {
  return Math.max(1, Math.floor(windowWidth / NUM_COLUMNS) - 1);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PhotoSkeleton({ photoSize }: { readonly photoSize: number }): React.ReactNode {
  return (
    <View testID="court-photos-loading" className="flex-row flex-wrap">
      {Array.from({ length: 9 }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={i} style={{ margin: 0.5 }}>
          <LoadingSkeleton width={photoSize} height={photoSize} borderRadius={0} />
        </View>
      ))}
    </View>
  );
}

interface PhotoGridProps {
  readonly photos: readonly CourtPhoto[];
  readonly photoSize: number;
  readonly onAddPhoto: () => void;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly onReport: (photoId: number) => void;
}

function PhotoGrid({
  photos,
  photoSize,
  onAddPhoto,
  refreshing,
  onRefresh,
  onReport,
}: PhotoGridProps): React.ReactNode {
  const palette = usePaletteColors();
  if (photos.length === 0) {
    return (
      <View
        testID="court-photos-empty"
        className="flex-1 items-center justify-center py-16 px-8"
      >
        <AppText className="text-[16px] font-semibold text-default mb-2 text-center">
          No Photos Yet
        </AppText>
        <AppText className="text-[14px] text-muted text-center mb-6">
          Add photos that help other players find and judge this court.
        </AppText>
        <Pressable
          testID="court-photos-add-first-btn"
          onPress={onAddPhoto}
          accessibilityRole="button"
          accessibilityLabel="Add Photo"
          className="bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
        >
          <AppText className="text-on-brand-gold font-bold text-[15px]">Add Photo</AppText>
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
        <Pressable
          key={item.id}
          onLongPress={() => onReport(item.id)}
          accessibilityHint="Long press to report this photo"
          style={{
            width: photoSize,
            height: photoSize,
            margin: 0.5,
            backgroundColor: palette.bgElevated,
          }}
        >
          <Image
            source={{ uri: item.url }}
            style={{ width: photoSize, height: photoSize }}
            accessibilityIgnoresInvertColors
            accessibilityLabel={item.caption ?? 'Court photo'}
          />
        </Pressable>
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
  const palette = usePaletteColors();
  const { width: windowWidth } = useWindowDimensions();
  const photoSize = getCourtPhotoSize(windowWidth);
  const [reportPhotoId, setReportPhotoId] = useState<number | null>(null);
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
    void onUploadPhoto()
      .then((photo) => {
        if (photo?.moderation_visibility === 'pending') {
          Alert.alert(
            'Photo submitted',
            'Your photo is being reviewed and will appear after approval.',
          );
        }
      })
      .catch(() => {
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
      className="min-h-touch min-w-touch items-center justify-center"
    >
      {isUploading ? (
        <ActivityIndicator
          testID="court-photos-upload-spinner"
          size="small"
          color={palette.brandTeal}
        />
      ) : (
        <AppText className="text-brand-teal font-semibold text-[15px]">+ Add</AppText>
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
        <PhotoSkeleton photoSize={photoSize} />
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
          <AppText className="text-[16px] font-semibold text-default mb-2">
            Could Not Load Photos
          </AppText>
          <Pressable
            testID="court-photos-retry-btn"
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Try Again"
            className="mt-4 bg-brand-gold px-8 py-[14px] rounded-[10px] active:opacity-80"
          >
            <AppText className="text-on-brand-gold font-bold text-[15px]">Try Again</AppText>
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
        <AppText className="text-[15px] font-semibold text-default">
          {header.name}
        </AppText>
        {header.address != null && (
          <AppText className="text-[13px] text-muted mt-0.5">
            {header.address}
          </AppText>
        )}
      </View>

      {/* Guidance text */}
      <View className="px-4 py-2 border-b border-strong">
        <AppText className="text-[13px] text-muted">
          Add photos that help other players find and judge this court.
        </AppText>
      </View>

      {/* Photo count */}
      <View
        testID="court-photos-count-bar"
        className="px-4 py-2 border-b border-strong"
      >
        <AppText className="text-[13px] font-medium text-default">
          {photos.length} photo{photos.length !== 1 ? 's' : ''}
        </AppText>
      </View>

      <PhotoGrid
        photos={photos}
        photoSize={photoSize}
        onAddPhoto={handleAddPhoto}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        onReport={setReportPhotoId}
      />
      {reportPhotoId != null && (
        <ReportSheet
          targetType="court_photo"
          targetId={reportPhotoId}
          onClose={() => setReportPhotoId(null)}
          onSubmitted={() => Alert.alert('Report received', 'Thank you for helping keep Beach League safe.')}
        />
      )}
    </SafeAreaView>
  );
}
