/**
 * CourtRow — single row in the courts list.
 *
 * Shows a thumbnail, court name, city/state, star rating, review count,
 * distance, and a chevron to navigate to the detail screen.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { formatDistance } from '@/lib/formatters';
import type { Court } from '@beach-kings/shared';

function ChevronRight(): React.ReactNode {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18l6-6-6-6"
        stroke="#9ca3af"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Renders filled/empty stars for a given rating (0-5). */
function StarRating({ rating }: { rating: number }): React.ReactNode {
  return (
    <View className="flex-row items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Text
          key={star}
          className={`text-[12px] ${
            star <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-300'
          }`}
        >
          ★
        </Text>
      ))}
    </View>
  );
}

interface CourtRowProps {
  readonly court: Court;
}

export default function CourtRow({ court }: CourtRowProps): React.ReactNode {
  const router = useRouter();

  const handlePress = useCallback(() => {
    void hapticLight();
    router.push(routes.court(court.id));
  }, [router, court.id]);

  // The list endpoint serializes the cover as `photo_url`; the nested arrays
  // are only present in detail contexts. Fall back through both, then to a
  // neutral placeholder (no stock/random imagery).
  const photoUrl =
    court.photo_url ||
    court.court_photos?.[0]?.url ||
    court.all_photos?.[0]?.url ||
    null;

  const locationLabel =
    [court.city, court.state].filter(Boolean).join(', ') ||
    court.location_name ||
    '';

  const accessibilityLabel = locationLabel
    ? `${court.name} in ${locationLabel}`
    : court.name;

  return (
    <Pressable
      testID={`court-row-${court.id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="flex-row items-center px-4 py-3 border-b border-strong active:bg-surface"
    >
      {/* Thumbnail (or neutral placeholder when the court has no photo) */}
      {photoUrl != null ? (
        <Image
          testID={`court-thumb-${court.id}`}
          source={{ uri: photoUrl }}
          className="w-[72px] h-[72px] rounded-lg bg-surface"
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          testID={`court-thumb-placeholder-${court.id}`}
          className="w-[72px] h-[72px] rounded-lg bg-info-tint"
        />
      )}

      {/* Content */}
      <View className="flex-1 ml-3">
        <Text className="text-[15px] font-semibold text-default mb-0.5">
          {court.name}
        </Text>
        {locationLabel.length > 0 && (
          <Text className="text-[13px] text-tertiary mb-1.5">
            {locationLabel}
          </Text>
        )}

        {/* Rating + distance row */}
        <View className="flex-row items-center gap-2">
          {(court.review_count ?? 0) > 0 ? (
            <>
              <StarRating rating={court.average_rating ?? 0} />
              <Text className="text-[12px] text-muted">
                {(court.average_rating ?? 0).toFixed(1)} ({court.review_count})
              </Text>
            </>
          ) : (
            <Text className="text-[12px] text-muted">No reviews yet</Text>
          )}
          {court.distance_miles != null && (
            <Text className="text-[12px] text-tertiary">
              · {formatDistance(court.distance_miles)}
            </Text>
          )}
        </View>
      </View>

      <ChevronRight />
    </Pressable>
  );
}
