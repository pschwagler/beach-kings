/**
 * Horizontal scroller of courts near the user.
 * Mirrors `home.html` `.court-scroll` + `.court-card`.
 */

import React from 'react';
import { View, ScrollView, Pressable, Image } from 'react-native';
import AppText from '@/components/ui/AppText';
import { useRouter } from 'expo-router';
import type { Court } from '@beach-kings/shared';
import { routes } from '@/lib/navigation';
import { formatDistance } from '@/lib/formatters';

interface CourtsScrollProps {
  readonly courts: readonly Court[];
  readonly maxItems?: number;
}

function formatLocation(court: Court): string {
  const cityState = court.city ?? court.location_name ?? '';
  const distance = formatDistance(court.distance_miles);
  return [cityState, distance].filter(Boolean).join(' · ');
}

function CourtCard({ court }: { readonly court: Court }): React.ReactNode {
  const router = useRouter();
  const hasDestination =
    (typeof court.id === 'number' &&
      Number.isInteger(court.id) &&
      court.id > 0) ||
    (typeof court.id === 'string' && court.id.trim().length > 0);

  const content = (
    <>
      {court.photo_url != null && court.photo_url !== '' ? (
        <Image
          source={{ uri: court.photo_url }}
          className="h-[100px] w-full"
          resizeMode="cover"
          accessibilityLabel={`${court.name} court photo`}
        />
      ) : (
        <View className="h-[100px] w-full bg-info-tint" />
      )}
      <View className="px-sm py-xs">
        <AppText
          className="text-footnote font-semibold text-default"
          numberOfLines={2}
        >
          {court.name}
        </AppText>
        <AppText
          className="text-[11px] text-tertiary mt-[3px]"
          numberOfLines={2}
        >
          {formatLocation(court)}
        </AppText>
      </View>
    </>
  );

  if (!hasDestination) {
    return (
      <View className="min-w-[200px] bg-surface rounded-card overflow-hidden border border-divider">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(routes.court(court.id))}
      accessibilityRole="link"
      accessibilityLabel={`Court ${court.name}`}
      className="min-w-[200px] bg-surface rounded-card overflow-hidden border border-divider"
    >
      {content}
    </Pressable>
  );
}

export default function CourtsScroll({
  courts,
  maxItems = 3,
}: CourtsScrollProps): React.ReactNode {
  if (courts.length === 0) {
    return (
      <View className="bg-surface rounded-card p-xl items-center">
        <AppText className="text-footnote text-tertiary">
          No courts found nearby
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
    >
      {courts.slice(0, maxItems).map((court) => (
        <CourtCard key={court.id} court={court} />
      ))}
    </ScrollView>
  );
}
