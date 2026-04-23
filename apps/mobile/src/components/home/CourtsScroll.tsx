/**
 * Horizontal scroller of courts near the user.
 * Mirrors `home.html` `.court-scroll` + `.court-card`.
 */

import React from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import type { Court } from '@beach-kings/shared';
import { routes } from '@/lib/navigation';

interface CourtsScrollProps {
  readonly courts: readonly Court[];
}

function formatLocation(court: Court): string {
  const cityState = court.city ?? court.location_name ?? '';
  const distance =
    court.distance_miles != null
      ? `${court.distance_miles.toFixed(1)} mi`
      : '';
  return [cityState, distance].filter(Boolean).join(' · ');
}

function CourtCard({ court }: { readonly court: Court }): React.ReactNode {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(routes.court(court.id))}
      accessibilityRole="link"
      accessibilityLabel={`Court ${court.name}`}
      className="min-w-[200px] bg-white dark:bg-dark-surface rounded-card overflow-hidden shadow-sm dark:shadow-none dark:border dark:border-border-subtle"
    >
      {court.photo_url != null && court.photo_url !== '' ? (
        <Image
          source={{ uri: court.photo_url }}
          className="h-[100px] w-full"
          resizeMode="cover"
        />
      ) : (
        <View className="h-[100px] w-full bg-[#a8d8ea] dark:bg-inset" />
      )}
      <View className="px-sm py-xs">
        <Text
          className="text-footnote font-semibold text-text-default dark:text-content-primary"
          numberOfLines={1}
        >
          {court.name}
        </Text>
        <Text
          className="text-[11px] text-gray-600 dark:text-content-tertiary mt-[3px]"
          numberOfLines={1}
        >
          {formatLocation(court)}
        </Text>
      </View>
    </Pressable>
  );
}

export default function CourtsScroll({ courts }: CourtsScrollProps): React.ReactNode {
  if (courts.length === 0) {
    return (
      <View className="bg-white dark:bg-dark-surface rounded-card p-xl items-center">
        <Text className="text-footnote text-gray-500 dark:text-content-tertiary">
          No courts found nearby
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
    >
      {courts.map((court) => (
        <CourtCard key={court.id} court={court} />
      ))}
    </ScrollView>
  );
}
