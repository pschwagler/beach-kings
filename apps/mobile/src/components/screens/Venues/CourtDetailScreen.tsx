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

import React, { useCallback, useState, useEffect } from 'react';
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
import CourtActionRow from './CourtActionRow';
import CourtHeroCarousel from './CourtHeroCarousel';
import CourtMapPreview from './CourtMapPreview';
import CourtReviewsSection from './CourtReviewsSection';
import { hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { api } from '@/lib/api';
import { type Court, type Player, formatLocation } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Badge({ label }: { label: string }): React.ReactNode {
  return (
    <View className="px-3 py-1 rounded-full bg-info-tint border border-brand-teal">
      <Text className="text-[12px] font-medium text-brand-teal">
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
      className="flex-row items-center gap-2 px-4 py-3 border-b border-strong"
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
      <Text className="text-[15px] font-semibold text-default">
        {rating.toFixed(1)}
      </Text>
      <Text className="text-[14px] text-muted">
        ({reviewCount} review{reviewCount !== 1 ? 's' : ''})
      </Text>
    </View>
  );
}

/**
 * Derives the current player id for a signed-in user.
 *
 * Mirrors the pattern used by useMessagesScreen. Returns null while loading
 * or when the user is not authenticated.
 */
function useCurrentPlayerId(): number | null {
  const [currentPlayerId, setCurrentPlayerId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const player = (await api.getCurrentUserPlayer()) as Player | null;
        if (!cancelled && player != null) {
          setCurrentPlayerId(player.id);
        }
      } catch {
        // Not authenticated or network error — remain null.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return currentPlayerId;
}

function CourtInfoSection({ court }: { court: Court }): React.ReactNode {
  return (
    <View
      testID="court-info-section"
      className="px-4 pt-4 pb-4 border-b border-strong"
    >
      <Text className="text-[16px] font-bold text-default mb-3">
        Court Info
      </Text>

      <View className="flex-row flex-wrap gap-x-6 gap-y-2 mb-4">
        {court.court_count != null && (
          <View>
            <Text className="text-[12px] text-tertiary uppercase tracking-wide">
              Courts
            </Text>
            <Text className="text-[14px] font-semibold text-default">
              {court.court_count}
            </Text>
          </View>
        )}
        <View>
          <Text className="text-[12px] text-tertiary uppercase tracking-wide">
            Surface
          </Text>
          <Text className="text-[14px] font-semibold text-default capitalize">
            {court.surface_type}
          </Text>
        </View>
        {court.hours != null && (
          <View>
            <Text className="text-[12px] text-tertiary uppercase tracking-wide">
              Hours
            </Text>
            <Text className="text-[14px] font-semibold text-default">
              {court.hours}
            </Text>
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
        <Text className="text-[16px] font-bold text-default">
          Photos
        </Text>
        <Pressable
          testID="court-see-all-photos-btn"
          onPress={onViewAll}
          accessibilityRole="button"
          accessibilityLabel="See all photos"
        >
          <Text className="text-[14px] text-brand-teal font-medium">
            See All
          </Text>
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
            <Text className="text-[16px] font-bold text-tertiary">
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
            className="w-[100px] h-[100px] rounded-lg border-2 border-dashed border-strong items-center justify-center"
          >
            <Text className="text-[24px] text-tertiary">+</Text>
            <Text className="text-[11px] text-tertiary mt-1">
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
  const currentPlayerId = useCurrentPlayerId();

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
        <TopNav title="Court" showBack backFallback={routes.courts()} />
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
        <TopNav title="Court" showBack backFallback={routes.courts()} />
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
      <TopNav title={court.name} showBack backFallback={routes.courts()} />

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
          <Text className="text-[20px] font-bold text-default mb-0.5">
            {court.name}
          </Text>
          {locationLabel != null && (
            <Text className="text-[14px] text-muted mb-3">
              {locationLabel}
            </Text>
          )}

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
