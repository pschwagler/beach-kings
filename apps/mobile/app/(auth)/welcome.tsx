import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CrownIcon } from '@/components/ui/icons';
import { Button } from '@/components/ui';

export default function WelcomeScreen(): React.ReactNode {
  const router = useRouter();

  const handleGetStarted = useCallback(() => {
    router.push('/(auth)/signup');
  }, [router]);

  const handleSignIn = useCallback(() => {
    router.push('/(auth)/login');
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-primary dark:bg-base justify-center items-center px-lg">
      {/* Crown icon + branding */}
      <View className="items-center mb-xxxl">
        <View testID="welcome-crown-icon" className="mb-lg">
          <CrownIcon size={64} color="#d4a843" />
        </View>
        <Text className="text-large-title font-bold text-white dark:text-content-primary tracking-wider">
          BEACH LEAGUE
        </Text>
      </View>

      {/* CTA buttons */}
      <View className="w-full gap-md">
        <Button
          title="Get Started"
          onPress={handleGetStarted}
          variant="secondary"
        />
        <Pressable
          className="min-h-touch items-center justify-center"
          onPress={handleSignIn}
          accessibilityLabel="Sign in to existing account"
          accessibilityRole="link"
        >
          <Text className="text-body font-semibold text-white dark:text-brand-teal">
            I Already Have an Account
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
