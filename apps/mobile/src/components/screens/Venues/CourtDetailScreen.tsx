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
  Linking,
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
import { openHttpUrl } from '@/lib/externalUrls';
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
      </View>
    </View>
  );
}

const WIND_LABELS = {
  sheltered: 'Sheltered',
  mixed: 'Mixed',
  exposed: 'Exposed',
} as const;
const SAND_LABELS = {
  shallow: 'Shallow',
  typical: 'Typical',
  deep: 'Deep',
} as const;

function PlayingConditionsSection({ court }: { court: Court }): React.ReactNode {
  const windNotes = court.wind_notes?.trim() || null;
  const sandNotes = court.sand_notes?.trim() || null;
  const hasConditions = court.wind_exposure != null || windNotes != null ||
    court.sand_depth != null || sandNotes != null;
  if (!hasConditions) return null;
  return (
    <View testID="court-playing-conditions" className="border-b border-strong px-4 py-4">
      <AppText className="mb-3 text-[16px] font-bold text-default">Playing Conditions</AppText>
      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-surface p-3">
          <AppText className="text-[12px] uppercase tracking-wide text-tertiary">Wind</AppText>
          <AppText className="mt-1 text-[14px] font-semibold text-default">
            {court.wind_exposure == null ? 'Not reported' : WIND_LABELS[court.wind_exposure]}
          </AppText>
          {windNotes != null && <AppText className="mt-1 text-[12px] leading-4 text-muted">{windNotes}</AppText>}
        </View>
        <View className="flex-1 rounded-xl bg-surface p-3">
          <AppText className="text-[12px] uppercase tracking-wide text-tertiary">Sand depth</AppText>
          <AppText className="mt-1 text-[14px] font-semibold text-default">
            {court.sand_depth == null ? 'Not reported' : SAND_LABELS[court.sand_depth]}
          </AppText>
          {sandNotes != null && <AppText className="mt-1 text-[12px] leading-4 text-muted">{sandNotes}</AppText>}
        </View>
      </View>
    </View>
  );
}

function PlanVisitSection({ court }: { court: Court }): React.ReactNode {
  const details = [court.hours, court.cost_info, court.parking_info, court.phone].filter(
    (value): value is string => value != null && value.length > 0,
  );
  if (details.length === 0 && !court.website) return null;
  return (
    <View testID="court-plan-visit" className="border-b border-strong px-4 py-4">
      <AppText className="mb-2 text-[16px] font-bold text-default">Plan Your Visit</AppText>
      {court.hours != null && (
        <View className="mb-2">
          <AppText className="text-[12px] font-semibold uppercase tracking-wide text-tertiary">Hours</AppText>
          <AppText className="text-[13px] text-muted">{court.hours}</AppText>
        </View>
      )}
      {court.cost_info != null && (
        <View className="mb-2">
          <AppText className="text-[12px] font-semibold uppercase tracking-wide text-tertiary">Cost</AppText>
          <AppText className="text-[13px] text-muted">{court.cost_info}</AppText>
        </View>
      )}
      {court.parking_info != null && (
        <View className="mb-2">
          <AppText className="text-[12px] font-semibold uppercase tracking-wide text-tertiary">Parking</AppText>
          <AppText className="text-[13px] text-muted">{court.parking_info}</AppText>
        </View>
      )}
      {court.phone != null && court.phone.length > 0 && (
        <Pressable
          testID="court-phone-link"
          onPress={() => { void Linking.openURL(`tel:${court.phone}`); }}
          accessibilityRole="link"
          accessibilityLabel={`Call ${court.name} at ${court.phone}`}
          className="min-h-touch self-start justify-center"
        >
          <AppText className="text-[13px] font-semibold text-brand-teal">Call {court.phone}</AppText>
        </Pressable>
      )}
      {court.website != null && court.website.length > 0 && (
        <Pressable
          testID="court-official-website"
          onPress={() => { void openHttpUrl(court.website!); }}
          accessibilityRole="link"
          accessibilityLabel={`Open official website for ${court.name}`}
          className="min-h-touch self-start justify-center"
        >
          <AppText className="text-[14px] font-semibold text-brand-teal">Official site / booking ↗</AppText>
        </Pressable>
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

  const handleSuggestEdit = useCallback(() => {
    void hapticMedium();
    router.push(routes.courtSuggestEdit(idOrSlug));
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

        <PlayingConditionsSection court={court} />

        <PlanVisitSection court={court} />

        {/* Location map */}
        <CourtMapPreview court={court} />

        <View className="border-b border-strong px-4 pb-4">
          <Pressable
            testID="suggest-court-edit-action"
            onPress={handleSuggestEdit}
            accessibilityRole="button"
            className="min-h-touch items-center justify-center rounded-xl border border-brand-teal"
          >
            <AppText className="text-[14px] font-semibold text-brand-teal">Suggest an edit</AppText>
          </Pressable>
        </View>

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
