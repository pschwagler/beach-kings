/**
 * CourtHeroCarousel — horizontally paged hero image carousel for the Court
 * Detail screen.
 *
 * Renders a full-width ScrollView with `pagingEnabled` so each slide snaps
 * to the viewport width. When more than one photo is available, dot
 * indicators are displayed below the images reflecting the current page.
 *
 * Photo source priority: `court.court_photos` → `court.all_photos`.
 * If both are empty or undefined, a single picsum placeholder is shown.
 *
 * The first/active image carries `testID="court-hero-image"` so that
 * existing CourtDetailScreen tests continue to pass unchanged.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';

import type { Court, CourtPhoto } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Height of the hero image in logical pixels. */
const HERO_HEIGHT = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the ordered list of photos for a court, falling back to
 * `all_photos` when `court_photos` is absent, and ultimately to an empty
 * array when neither is present.
 */
function resolvePhotos(court: Court): CourtPhoto[] {
  return court.court_photos ?? court.all_photos ?? [];
}

/**
 * Returns the placeholder picsum URL for a court with no uploaded photos.
 */
function placeholderUrl(courtId: number | string): string {
  return `https://picsum.photos/seed/court${courtId}/800/400`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface DotIndicatorsProps {
  readonly count: number;
  readonly activeIndex: number;
}

/**
 * Renders a row of circular dot indicators.
 * Only shown when `count > 1`.
 */
function DotIndicators({ count, activeIndex }: DotIndicatorsProps): React.ReactNode {
  if (count <= 1) return null;

  return (
    <View className="absolute bottom-8 left-0 right-0 flex-row justify-center gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          testID="carousel-dot"
          className={`w-1.5 h-1.5 rounded-full ${
            i === activeIndex ? 'bg-white' : 'bg-white/50'
          }`}
        />
      ))}
    </View>
  );
}

interface PhotoCountBadgeProps {
  readonly count: number;
}

/**
 * Semi-transparent badge showing total photo count.
 * Only shown when `count > 0`.
 */
function PhotoCountBadge({ count }: PhotoCountBadgeProps): React.ReactNode {
  if (count <= 0) return null;

  return (
    <View
      testID="photo-count-badge"
      className="absolute bottom-3 right-3 bg-black/60 rounded-lg px-2 py-1"
    >
      <Text className="text-white text-[12px] font-medium">
        {count} photos
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CourtHeroCarouselProps {
  /** The court whose photos (or placeholder) will be rendered. */
  readonly court: Court;
}

/**
 * Horizontally paged carousel of court hero images.
 *
 * Uses a `ScrollView` with `pagingEnabled` and `horizontal` for the lightest
 * possible implementation — no external library required.
 */
export default function CourtHeroCarousel({
  court,
}: CourtHeroCarouselProps): React.ReactNode {
  const { width: windowWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const photos = resolvePhotos(court);
  const hasPhotos = photos.length > 0;

  // Build the ordered list of slides. If there are no uploaded photos we
  // render a single placeholder slide so the hero area is never empty.
  const slides: CourtPhoto[] = hasPhotos
    ? photos
    : [{ id: -1, url: placeholderUrl(court.id) }];

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / windowWidth);
      setActiveIndex(newIndex);
    },
    [windowWidth],
  );

  const totalPhotoCount = court.photo_count ?? (hasPhotos ? photos.length : 0);

  return (
    <View testID="court-hero-image" className="relative">
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        decelerationRate="fast"
        style={{ width: windowWidth, height: HERO_HEIGHT }}
        contentContainerStyle={{ alignItems: 'stretch' }}
      >
        {slides.map((photo, index) => (
          <View
            key={photo.id}
            testID="carousel-slide"
            style={{ width: windowWidth, height: HERO_HEIGHT }}
          >
            <Image
              source={{ uri: photo.url }}
              style={{ width: windowWidth, height: HERO_HEIGHT }}
              className="bg-surface"
              accessibilityIgnoresInvertColors
              // The first slide is the "active" hero for accessibility and
              // legacy testID lookup purposes.
              accessibilityLabel={
                index === 0 ? `Court photo ${index + 1}` : undefined
              }
            />
          </View>
        ))}
      </ScrollView>

      <DotIndicators count={slides.length} activeIndex={activeIndex} />
      <PhotoCountBadge count={totalPhotoCount} />
    </View>
  );
}
