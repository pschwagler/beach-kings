/**
 * CourtRow — single row in the courts list.
 *
 * Shows a thumbnail, court name, city/state, star rating, review count,
 * distance, and a chevron to navigate to the detail screen.
 */

import React, { useCallback } from "react";
import { View, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { hapticLight } from "@/utils/haptics";
import { routes } from "@/lib/navigation";
import { formatDistance } from "@/lib/formatters";
import { ChevronRightIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
import AppText from '@/components/ui/AppText';
import { courtSurfaceLabel } from '@/features/courts';
import CourtRating from "./CourtRating";
import type { Court } from "@beach-kings/shared";

interface CourtRowProps {
  readonly court: Court;
}

export default function CourtRow({ court }: CourtRowProps): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();

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
    [court.city, court.state].filter(Boolean).join(", ") ||
    court.location_name ||
    "";

  const accessibilityLabel = locationLabel
    ? `${court.name} in ${locationLabel}`
    : court.name;
  const signals = [
    court.is_saved === true ? 'Saved' : null,
    courtSurfaceLabel(court),
    court.has_lights === true ? 'Lighted' : null,
    court.is_free === true ? 'Free play' : null,
  ].filter((signal): signal is string => signal != null);

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
        <AppText className="text-[15px] font-semibold text-default mb-0.5" numberOfLines={2}>
          {court.name}
        </AppText>
        {locationLabel.length > 0 && (
          <AppText className="text-[13px] text-tertiary mb-1.5" numberOfLines={2}>
            {locationLabel}
          </AppText>
        )}

        {signals.length > 0 && (
          <AppText className="text-[11px] font-medium text-brand-teal mb-1" numberOfLines={2}>
            {signals.join(' · ')}
          </AppText>
        )}

        {/* Rating + distance row */}
        <View className="flex-row items-center gap-2">
          <CourtRating
            rating={court.average_rating ?? 0}
            reviewCount={court.review_count ?? 0}
            combineScoreAndCount
          />
          {court.distance_miles != null && (
            <AppText className="text-[12px] text-tertiary">
              · {formatDistance(court.distance_miles)}
            </AppText>
          )}
        </View>
      </View>

      <ChevronRightIcon size={16} color={palette.textTertiary} />
    </Pressable>
  );
}
