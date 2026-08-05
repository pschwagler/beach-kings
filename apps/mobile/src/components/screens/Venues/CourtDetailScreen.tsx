/**
 * CourtDetailScreen — full detail view for a single court.
 *
 * Renders:
 *   - Hero image carousel stub with dot indicators and photo count badge
 *   - Court name, city, feature badges (Outdoor/Lighted/Free Play)
 *   - Star rating bar with score + review count
 *   - Action row: Check In (primary) + Add to My Courts (outline)
 *   - Court Info section: count/surface/hours + map preview with address
 *   - Photos section: 3-col grid + "+more" tile linking to gallery
 *   - Reviews section
 *   - Skeleton while loading
 *   - Error state with retry
 *
 * Wireframe ref: court-detail.html
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import {
  View,
  ScrollView,
  Image,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import { useCourtDetailScreen } from './useCourtDetailScreen';
import CourtDetailSkeleton from './CourtDetailSkeleton';
import CourtDetailErrorState from './CourtDetailErrorState';
import CourtActionRow from './CourtActionRow';
import CourtHeroCarousel from './CourtHeroCarousel';
import CourtMapPreview from './CourtMapPreview';
import CourtReviewsSection from './CourtReviewsSection';
import CourtRating from './CourtRating';
import { hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { type Court, formatLocation } from '@beach-kings/shared';
import { courtSurfaceLabel, isIndoorCourt } from '@/features/courts';
import { useCurrentPlayer } from '@/hooks/useCurrentPlayer';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Badge({ label }: { label: string }): React.ReactNode {
  return (
    <View className="px-3 py-1 rounded-full bg-info-tint border border-brand-teal">
      <AppText className="text-[12px] font-medium text-brand-teal">
        {label}
      </AppText>
    </View>
  );
}

function CourtInfoSection({ court }: { court: Court }): React.ReactNode {
  return (
    <View
      testID="court-info-section"
      className="px-4 pt-4 pb-4 border-b border-strong"
    >
      <AppText className="text-[16px] font-bold text-default mb-3">
        Court Info
      </AppText>

      <View className="flex-row flex-wrap gap-x-6 gap-y-2 mb-4">
        {court.court_count != null && (
          <View>
            <AppText className="text-[12px] text-tertiary uppercase tracking-wide">
              Courts
            </AppText>
            <AppText className="text-[14px] font-semibold text-default">
              {court.court_count}
            </AppText>
          </View>
        )}
        <View>
          <AppText className="text-[12px] text-tertiary uppercase tracking-wide">
            Surface
          </AppText>
          <AppText className="text-[14px] font-semibold text-default">
            {courtSurfaceLabel(court) ?? 'Not specified'}
          </AppText>
        </View>
        {court.hours != null && (
          <View>
            <AppText className="text-[12px] text-tertiary uppercase tracking-wide">
              Hours
            </AppText>
            <AppText className="text-[14px] font-semibold text-default">
              {court.hours}
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

function PhotosSection({
  court,
  onViewAll,
}: {
  court: Court;
  onViewAll: () => void;
}): React.ReactNode {
  const photos = court.court_photos ?? court.all_photos ?? [];
  const visiblePhotos = photos.slice(0, 3);
  const remaining = (court.photo_count ?? photos.length) - visiblePhotos.length;

  return (
    <View
      testID="court-photos-section"
      className="px-4 pt-4 pb-4 border-b border-strong"
    >
      <View className="flex-row justify-between items-center mb-3">
        <AppText className="text-[16px] font-bold text-default">
          Photos
        </AppText>
        <Pressable
          testID="court-see-all-photos-btn"
          onPress={onViewAll}
          accessibilityRole="button"
          accessibilityLabel="See all photos"
          className="min-h-touch px-sm items-center justify-center"
        >
          <AppText className="text-[14px] text-brand-teal font-medium">
            See All
          </AppText>
        </Pressable>
      </View>

      <View className="flex-row gap-2">
        {visiblePhotos.map((photo) => (
          <Image
            key={photo.id}
            source={{ uri: photo.url }}
            className="flex-1 h-[100px] rounded-lg bg-surface"
            accessibilityIgnoresInvertColors
          />
        ))}
        {remaining > 0 && visiblePhotos.length > 0 && (
          <Pressable
            testID="court-more-photos-btn"
            onPress={onViewAll}
            accessibilityRole="button"
            accessibilityLabel={`View ${remaining} more photos`}
            className="w-[100px] h-[100px] rounded-lg bg-surface items-center justify-center"
          >
            <AppText className="text-[16px] font-bold text-tertiary">
              +{remaining}
            </AppText>
          </Pressable>
        )}
        {photos.length === 0 && (
          <Pressable
            testID="court-add-photo-placeholder"
            onPress={onViewAll}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
            className="w-[100px] h-[100px] rounded-lg border-2 border-dashed border-strong items-center justify-center"
          >
            <AppText className="text-[24px] text-tertiary">+</AppText>
            <AppText className="text-[11px] text-tertiary mt-1">
              Add Photo
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface CourtDetailScreenProps {
  readonly idOrSlug: number | string;
}

export default function CourtDetailScreen({
  idOrSlug,
}: CourtDetailScreenProps): React.ReactNode {
  const router = useRouter();
  const { court, isLoading, error, isRefreshing, onRefresh, onRetry } =
    useCourtDetailScreen(idOrSlug);
  const currentPlayerId = useCurrentPlayer().data?.id ?? null;

  const handleViewPhotos = useCallback(() => {
    void hapticMedium();
    router.push(routes.courtPhotos(idOrSlug));
  }, [router, idOrSlug]);

  // --- Loading skeleton ---
  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="court-detail-screen"
      >
        <TopNav title="Court" showBack />
        <CourtDetailSkeleton />
      </SafeAreaView>
    );
  }

  // --- Error ---
  if (error != null || court == null) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="court-detail-screen"
      >
        <TopNav title="Court" showBack />
        <CourtDetailErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  // Omit the city/state line entirely when both are empty (avoids a bare ",");
  // the full street address still renders further down. See formatLocation.
  const locationLabel = formatLocation(court.city, court.state);

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="court-detail-screen"
    >
      <TopNav title="Court" showBack />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        {/* Hero carousel */}
        <CourtHeroCarousel court={court} />

        {/* Header */}
        <View
          testID="court-header"
          className="px-4 pt-4 pb-3 border-b border-strong"
        >
          <AppText family="display" weight="bold" className="text-[20px] text-default mb-0.5" numberOfLines={2}>
            {court.name}
          </AppText>
          {locationLabel != null && (
            <AppText className="text-[14px] text-muted mb-3">
              {locationLabel}
            </AppText>
          )}

          {/* Feature badges */}
          <View className="flex-row flex-wrap gap-2">
            {court.surface_type === 'sand' && <Badge label="Outdoor" />}
            {isIndoorCourt(court) && <Badge label="Indoor" />}
            {court.has_lights === true && <Badge label="Lighted" />}
            {court.is_free === true && <Badge label="Free Play" />}
            {court.nets_provided === true && <Badge label="Nets Provided" />}
          </View>
        </View>

        {/* Rating bar */}
        <View
          testID="court-rating-bar"
          className="flex-row items-center gap-2 px-4 py-3 border-b border-strong"
        >
          <CourtRating
            rating={court.average_rating ?? 0}
            reviewCount={court.review_count ?? 0}
            starTextClassName="text-[18px]"
            scoreTextClassName="text-[15px] font-semibold text-default"
            countTextClassName="text-[14px] text-muted"
            emptyTextClassName="text-[15px] text-muted"
            showReviewWord
          />
        </View>

        {/* Action row — check in + my courts */}
        <CourtActionRow
          court={court}
          currentPlayerId={currentPlayerId}
          onChanged={onRefresh}
        />

        {/* Court info */}
        <CourtInfoSection court={court} />

        {/* Location map */}
        <CourtMapPreview court={court} />

        {/* Photos */}
        <PhotosSection court={court} onViewAll={handleViewPhotos} />

        {/* Reviews */}
        <CourtReviewsSection
          court={court}
          currentPlayerId={currentPlayerId}
          onReviewChanged={onRefresh}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
