import React, { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  CrownIcon,
  TrophyIcon,
  TrendingUpIcon,
  UsersIcon,
  MapPinIcon,
  AwardIcon,
} from '@/components/ui/icons';
import { Button } from '@/components/ui';
import CourtLineMotif from '@/components/brand/CourtLineMotif';
import { routes } from '@/lib/navigation';
import { PUBLIC_URLS } from '@/lib/publicUrls';
import { openPublicWebUrl } from '@/lib/externalUrls';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface FeatureRow {
  readonly title: string;
  readonly description: string;
  readonly Icon: (props: { size?: number; color?: string }) => React.ReactNode;
}

const FEATURES: readonly FeatureRow[] = [
  {
    title: 'Track your games',
    description: 'Log your games. See who you play best with or against.',
    Icon: TrendingUpIcon,
  },
  {
    title: 'Join Leagues',
    description: 'Compete in local beach volleyball leagues.',
    Icon: TrophyIcon,
  },
  {
    title: 'Find Players',
    description: 'Connect with new players no matter where you are.',
    Icon: UsersIcon,
  },
  {
    title: 'Discover Courts',
    description: 'Find beach volleyball courts across the country.',
    Icon: MapPinIcon,
  },
  {
    title: 'Tournaments',
    description: 'Create and manage tournaments with friends.',
    Icon: AwardIcon,
  },
];

export default function WelcomeScreen(): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();

  const handleGetStarted = useCallback(() => {
    router.push(routes.signup());
  }, [router]);

  const handleSignIn = useCallback(() => {
    router.push(routes.login());
  }, [router]);

  const handleTos = useCallback(() => {
    void openPublicWebUrl(PUBLIC_URLS.terms);
  }, []);

  const handlePrivacy = useCallback(() => {
    void openPublicWebUrl(PUBLIC_URLS.privacy);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-nav">
      <StatusBar style="light" />
      <View className="relative flex-1 overflow-hidden">
        <CourtLineMotif variant="welcome" />
        <View className="relative flex-1 justify-between px-lg py-xl">
          <View className="flex-1 justify-center">
            <View className="items-center mb-xxl">
              <View testID="welcome-crown-icon" className="mb-md">
                <CrownIcon size={64} color={palette.brandGold} />
              </View>
              <AppText
                family="display"
                className="text-large-title font-bold text-inverse tracking-wider mb-xs"
              >
                BEACH LEAGUE
              </AppText>
              <AppText className="text-body text-inverse text-center">
                Track your games. Find new players.{'\n'}Rule the Sand.
              </AppText>
            </View>

            <View className="gap-md mb-xl">
              {FEATURES.map(({ title, description, Icon }) => (
                <View key={title} className="flex-row items-center gap-md">
                  <View className="w-11 h-11 items-center justify-center">
                    <Icon size={20} color={palette.textInverse} />
                  </View>
                  <View className="flex-1">
                    <AppText className="text-footnote font-semibold text-inverse">
                      {title}
                    </AppText>
                    <AppText className="text-caption text-inverse mt-xxs">
                      {description}
                    </AppText>
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
              className="min-h-touch items-center justify-center rounded-card border border-inverse"
              onPress={handleSignIn}
              testID="welcome-sign-in-link"
              accessibilityLabel="I already have an account"
              accessibilityRole="link"
            >
              <AppText className="text-body font-semibold text-inverse">
                I Already Have an Account
              </AppText>
            </Pressable>

            <View className="items-center mt-md">
              <AppText className="text-caption text-inverse text-center">
                By continuing, you agree to our
              </AppText>
              <View className="flex-row gap-xs mt-xxs">
                <Pressable onPress={handleTos} accessibilityRole="link">
                  <AppText className="text-caption text-inverse underline">
                    Terms of Service
                  </AppText>
                </Pressable>
                <AppText className="text-caption text-inverse">and</AppText>
                <Pressable onPress={handlePrivacy} accessibilityRole="link">
                  <AppText className="text-caption text-inverse underline">
                    Privacy Policy
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
