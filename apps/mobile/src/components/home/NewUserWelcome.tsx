/**
 * Full-screen welcome for brand-new users (no leagues, no games).
 * Mirrors `home.html` `.new-user-welcome`.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { CrownIcon } from '@/components/ui/icons';
import { routes } from '@/lib/navigation';

export default function NewUserWelcome(): React.ReactNode {
  const router = useRouter();

  return (
    <View className="flex-1 items-center px-2xl pt-[80px] pb-xxl">
      <View className="mb-md">
        <CrownIcon size={48} color="#d4a843" />
      </View>
      <Text className="text-title3 font-bold text-text-default dark:text-content-primary mb-sm text-center">
        Welcome to Beach League
      </Text>
      <Text className="text-footnote text-gray-500 dark:text-content-tertiary text-center mb-xl">
        Track your games, find leagues near you, and connect with players.
      </Text>

      <View className="w-full gap-sm">
        <Pressable
          onPress={() => router.push(routes.findLeagues())}
          accessibilityRole="link"
          className="bg-primary dark:bg-brand-teal rounded-card py-md items-center justify-center min-h-touch"
        >
          <Text className="text-white font-bold text-body">Find a League</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(routes.addGames())}
          accessibilityRole="link"
          className="bg-accent dark:bg-brand-gold rounded-card py-md items-center justify-center min-h-touch"
        >
          <Text className="text-white font-bold text-body">
            Add Your First Game
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(routes.courts())}
          accessibilityRole="link"
          className="bg-transparent border-[1.5px] border-primary dark:border-brand-teal rounded-card py-md items-center justify-center min-h-touch"
        >
          <Text className="text-primary dark:text-brand-teal font-bold text-body">
            Find Courts
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
