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

  const photoUrl =
    (court.court_photos?.[0]?.url ?? court.all_photos?.[0]?.url) ??
    `https://picsum.photos/seed/court${court.id}/144/144`;

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
      className="flex-row items-center px-4 py-3 border-b border-border dark:border-border-strong active:bg-gray-50 dark:active:bg-dark-surface"
    >
      {/* Thumbnail */}
      <Image
        source={{ uri: photoUrl }}
        className="w-[72px] h-[72px] rounded-lg bg-gray-100 dark:bg-dark-surface"
        accessibilityIgnoresInvertColors
      />

      {/* Content */}
      <View className="flex-1 ml-3">
        <Text className="text-[15px] font-semibold text-text-default dark:text-content-primary mb-0.5">
          {court.name}
        </Text>
        {locationLabel.length > 0 && (
          <Text className="text-[13px] text-text-muted dark:text-content-tertiary mb-1.5">
            {locationLabel}
          </Text>
        )}

        {/* Rating + distance row */}
        <View className="flex-row items-center gap-2">
          <StarRating rating={court.average_rating ?? 0} />
          <Text className="text-[12px] text-text-muted dark:text-content-secondary">
            {(court.average_rating ?? 0).toFixed(1)} ({court.review_count ?? 0})
          </Text>
          {court.distance_miles != null && (
            <Text className="text-[12px] text-text-muted dark:text-content-tertiary">
              · {court.distance_miles.toFixed(1)} mi
            </Text>
          )}
        </View>
      </View>

      <ChevronRight />
    </Pressable>
  );
}
