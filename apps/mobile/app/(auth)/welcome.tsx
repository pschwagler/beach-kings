import React, { useCallback } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  CrownIcon,
  TrophyIcon,
  TrendingUpIcon,
  UsersIcon,
  MapPinIcon,
} from '@/components/ui/icons';
import { Button } from '@/components/ui';
import { routes } from '@/lib/navigation';

interface FeatureRow {
  readonly title: string;
  readonly description: string;
  readonly Icon: (props: { size?: number; color?: string }) => React.ReactNode;
}

const FEATURES: readonly FeatureRow[] = [
  {
    title: 'Join Leagues',
    description: 'Compete in local beach volleyball leagues',
    Icon: TrophyIcon,
  },
  {
    title: 'Track Your Rating',
    description: 'ELO-based ratings across all your matches',
    Icon: TrendingUpIcon,
  },
  {
    title: 'Find Players',
    description: 'Connect with players at your level near you',
    Icon: UsersIcon,
  },
  {
    title: 'Discover Courts',
    description: 'Find and review beach volleyball courts',
    Icon: MapPinIcon,
  },
];

export default function WelcomeScreen(): React.ReactNode {
  const router = useRouter();

  const handleGetStarted = useCallback(() => {
    router.push(routes.signup());
  }, [router]);

  const handleSignIn = useCallback(() => {
    router.push(routes.login());
  }, [router]);

  const handleTos = useCallback(() => {
    Linking.openURL('https://beachleague.app/terms');
  }, []);

  const handlePrivacy = useCallback(() => {
    Linking.openURL('https://beachleague.app/privacy');
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-primary dark:bg-base">
      <View className="flex-1 justify-between px-lg py-xl">
        <View className="flex-1 justify-center">
          <View className="items-center mb-xxl">
            <View testID="welcome-crown-icon" className="mb-md">
              <CrownIcon size={64} color="#d4a843" />
            </View>
            <Text className="text-large-title font-bold text-white tracking-wider mb-xs">
              BEACH LEAGUE
            </Text>
            <Text className="text-body text-white/70 text-center">
              Track your games. Climb the ranks.{'\n'}Rule the sand.
            </Text>
          </View>

          <View className="gap-md mb-xl">
            {FEATURES.map(({ title, description, Icon }) => (
              <View key={title} className="flex-row items-center gap-md">
                <View className="w-11 h-11 rounded-xl bg-white/10 items-center justify-center">
                  <Icon size={20} color="#ffffff" />
                </View>
                <View className="flex-1">
                  <Text className="text-footnote font-semibold text-white">
                    {title}
                  </Text>
                  <Text className="text-caption text-white/60 mt-xxs">
                    {description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="gap-sm">
          <Button
            title="Get Started"
            onPress={handleGetStarted}
            variant="secondary"
          />
          <Pressable
            className="min-h-touch items-center justify-center rounded-card border border-white/30"
            onPress={handleSignIn}
            accessibilityLabel="I already have an account"
            accessibilityRole="link"
          >
            <Text className="text-body font-semibold text-white">
              I Already Have an Account
            </Text>
          </Pressable>

          <View className="items-center mt-md">
            <Text className="text-caption text-white/65 text-center">
              By continuing, you agree to our
            </Text>
            <View className="flex-row gap-xs mt-xxs">
              <Pressable onPress={handleTos} accessibilityRole="link">
                <Text className="text-caption text-white/70 underline">
                  Terms of Service
                </Text>
              </Pressable>
              <Text className="text-caption text-white/65">and</Text>
              <Pressable onPress={handlePrivacy} accessibilityRole="link">
                <Text className="text-caption text-white/70 underline">
                  Privacy Policy
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
