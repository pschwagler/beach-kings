import React from 'react';
import { Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';

export default function SocialScreen(): React.ReactNode {
  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base" edges={['top']}>
      <TopNav title="Social" />
      <ScrollView className="flex-1 px-lg">
        <Text className="text-headline font-semibold text-text-default dark:text-content-primary mt-lg">
          Social
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
