import React from 'react';
import { Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';

export default function ProfileScreen(): React.ReactNode {
  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base" edges={['top']}>
      <TopNav title="Profile" />
      <ScrollView className="flex-1 px-lg">
        <Text className="text-headline font-semibold text-text-default dark:text-content-primary mt-lg">
          Profile
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
