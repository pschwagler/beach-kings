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
 *   - Reviews section stub
 *   - Skeleton while loading
 *   - Error state with retry
 *
 * Wireframe ref: court-detail.html
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
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
import { hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import type { Court } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Badge({ label }: { label: string }): React.ReactNode {
  return (
    <View className="px-3 py-1 rounded-full bg-teal-50 dark:bg-info-bg border border-teal-200 dark:border-brand-teal">
      <Text className="text-[12px] font-medium text-primary dark:text-brand-teal">
        {label}
      </Text>
    </View>
  );
}

function StarRatingBar({
  rating,
  reviewCount,
}: {
  rating: number;
  reviewCount: number;
}): React.ReactNode {
  return (
    <View
      testID="court-rating-bar"
      className="flex-row items-center gap-2 px-4 py-3 border-b border-border dark:border-border-strong"
    >
      <View className="flex-row items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Text
            key={star}
            className={`text-[18px] ${
              star <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-200'
            }`}
          >
            ★
          </Text>
        ))}
      </View>
      <Text className="text-[15px] font-semibold text-text-default dark:text-content-primary">
        {rating.toFixed(1)}
      </Text>
      <Text className="text-[14px] text-text-muted dark:text-content-secondary">
        ({reviewCount} review{reviewCount !== 1 ? 's' : ''})
      </Text>
    </View>
  );
}

function ActionRow({
  courtId,
}: {
  courtId: number | string;
}): React.ReactNode {
  const handleCheckIn = useCallback(() => {
    void hapticMedium();
    // TODO(backend): POST /api/courts/:id/check-in
  }, []);

  const handleAddToMyCourts = useCallback(() => {
    void hapticMedium();
    // TODO(backend): POST /api/users/me/courts
  }, []);

  return (
    <View className="flex-row gap-3 px-4 py-4 border-b border-border dark:border-border-strong">
      <Pressable
        testID={`check-in-btn-${courtId}`}
        onPress={handleCheckIn}
        accessibilityRole="button"
        accessibilityLabel="Check In"
        className="flex-1 bg-accent dark:bg-brand-gold py-[14px] rounded-[10px] items-center active:opacity-80"
      >
        <Text className="text-white font-bold text-[15px]">Check In</Text>
      </Pressable>

      <Pressable
        testID={`add-court-btn-${courtId}`}
        onPress={handleAddToMyCourts}
        accessibilityRole="button"
        accessibilityLabel="Add to My Courts"
        className="flex-1 py-[14px] rounded-[10px] items-center border border-primary dark:border-brand-teal active:opacity-80"
      >
        <Text className="text-primary dark:text-brand-teal font-semibold text-[15px]">
          My Courts
        </Text>
      </Pressable>
    </View>
  );
}

function CourtInfoSection({ court }: { court: Court }): React.ReactNode {
  return (
    <View
      testID="court-info-section"
      className="px-4 pt-4 pb-4 border-b border-border dark:border-border-strong"
    >
      <Text className="text-[16px] font-bold text-text-default dark:text-content-primary mb-3">
        Court Info
      </Text>

      <View className="flex-row flex-wrap gap-x-6 gap-y-2 mb-4">
        {court.court_count != null && (
          <View>
            <Text className="text-[12px] text-text-muted dark:text-content-tertiary uppercase tracking-wide">
              Courts
            </Text>
            <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
              {court.court_count}
            </Text>
          </View>
        )}
        <View>
          <Text className="text-[12px] text-text-muted dark:text-content-tertiary uppercase tracking-wide">
            Surface
          </Text>
          <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary capitalize">
            {court.surface_type}
          </Text>
        </View>
        {court.hours != null && (
          <View>
            <Text className="text-[12px] text-text-muted dark:text-content-tertiary uppercase tracking-wide">
              Hours
            </Text>
            <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
              {court.hours}
            </Text>
          </View>
        )}
      </View>

      {/* Map preview stub */}
      <View
        testID="court-map-preview"
        className="h-[100px] rounded-xl bg-teal-50 dark:bg-info-bg items-center justify-center border border-border dark:border-border-strong"
      >
        <Text className="text-[13px] text-text-muted dark:text-content-secondary">
          Map preview
        </Text>
      </View>
      {court.address != null && (
        <Text className="text-[13px] text-text-muted dark:text-content-secondary mt-2">
          {court.address}
        </Text>
      )}
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
      className="px-4 pt-4 pb-4 border-b border-border dark:border-border-strong"
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-[16px] font-bold text-text-default dark:text-content-primary">
          Photos
        </Text>
        <Pressable
          testID="court-see-all-photos-btn"
          onPress={onViewAll}
          accessibilityRole="button"
          accessibilityLabel="See all photos"
        >
          <Text className="text-[14px] text-primary dark:text-brand-teal font-medium">
            See All
          </Text>
        </Pressable>
      </View>

      <View className="flex-row gap-2">
        {visiblePhotos.map((photo) => (
          <Image
            key={photo.id}
            source={{ uri: photo.url }}
            className="flex-1 h-[100px] rounded-lg bg-gray-100 dark:bg-dark-surface"
            accessibilityIgnoresInvertColors
          />
        ))}
        {remaining > 0 && visiblePhotos.length > 0 && (
          <Pressable
            testID="court-more-photos-btn"
            onPress={onViewAll}
            accessibilityRole="button"
            accessibilityLabel={`View ${remaining} more photos`}
            className="w-[100px] h-[100px] rounded-lg bg-gray-100 dark:bg-dark-surface items-center justify-center"
          >
            <Text className="text-[16px] font-bold text-text-muted dark:text-content-tertiary">
              +{remaining}
            </Text>
          </Pressable>
        )}
        {photos.length === 0 && (
          <Pressable
            testID="court-add-photo-placeholder"
            onPress={onViewAll}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
            className="w-[100px] h-[100px] rounded-lg border-2 border-dashed border-border dark:border-border-strong items-center justify-center"
          >
            <Text className="text-[24px] text-text-muted dark:text-content-tertiary">+</Text>
            <Text className="text-[11px] text-text-muted dark:text-content-tertiary mt-1">
              Add Photo
            </Text>
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

  const handleViewPhotos = useCallback(() => {
    void hapticMedium();
    router.push(routes.courtPhotos(idOrSlug));
  }, [router, idOrSlug]);

  // --- Loading skeleton ---
  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
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
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="court-detail-screen"
      >
        <TopNav title="Court" showBack />
        <CourtDetailErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  const heroUrl =
    (court.court_photos?.[0]?.url ?? court.all_photos?.[0]?.url) ??
    `https://picsum.photos/seed/court${court.id}/800/400`;

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="court-detail-screen"
    >
      <TopNav title={court.name} showBack />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        {/* Hero image */}
        <View testID="court-hero-image" className="relative">
          <Image
            source={{ uri: heroUrl }}
            className="w-full h-[200px] bg-gray-100 dark:bg-dark-surface"
            accessibilityIgnoresInvertColors
          />
          {/* Photo count badge */}
          {(court.photo_count ?? 0) > 0 && (
            <View className="absolute bottom-3 right-3 bg-black/60 rounded-lg px-2 py-1">
              <Text className="text-white text-[12px] font-medium">
                {court.photo_count} photos
              </Text>
            </View>
          )}
        </View>

        {/* Header */}
        <View
          testID="court-header"
          className="px-4 pt-4 pb-3 border-b border-border dark:border-border-strong"
        >
          <Text className="text-[20px] font-bold text-text-default dark:text-content-primary mb-0.5">
            {court.name}
          </Text>
          <Text className="text-[14px] text-text-muted dark:text-content-secondary mb-3">
            {court.city}, {court.state}
          </Text>

          {/* Feature badges */}
          <View className="flex-row flex-wrap gap-2">
            {court.surface_type === 'sand' && <Badge label="Outdoor" />}
            {court.surface_type === 'indoor' && <Badge label="Indoor" />}
            {court.has_lights === true && <Badge label="Lighted" />}
            {court.is_free === true && <Badge label="Free Play" />}
            {court.nets_provided === true && <Badge label="Nets Provided" />}
          </View>
        </View>

        {/* Rating bar */}
        <StarRatingBar
          rating={court.average_rating ?? 0}
          reviewCount={court.review_count ?? 0}
        />

        {/* Action row */}
        <ActionRow courtId={court.id} />

        {/* Court info */}
        <CourtInfoSection court={court} />

        {/* Photos */}
        <PhotosSection court={court} onViewAll={handleViewPhotos} />

        {/* Reviews stub */}
        <View
          testID="court-reviews-section"
          className="px-4 pt-4 pb-4"
        >
          <Text className="text-[16px] font-bold text-text-default dark:text-content-primary mb-2">
            Reviews
          </Text>
          <Text className="text-[14px] text-text-muted dark:text-content-secondary">
            {court.review_count != null && court.review_count > 0
              ? `${court.review_count} review${court.review_count !== 1 ? 's' : ''}`
              : 'No reviews yet. Be the first to review!'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
