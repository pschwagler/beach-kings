/**
 * Placeholder screen used by stack routes whose real implementation
 * has not shipped yet. Rendering a stub here means router pushes do not
 * throw "unmatched route" errors while the feature is under construction.
 */

import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import EmptyState from '@/components/ui/EmptyState';

interface ComingSoonProps {
  readonly title: string;
  readonly description?: string;
}

export default function ComingSoon({
  title,
  description = 'This screen is under construction.',
}: ComingSoonProps): React.ReactNode {
  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base" edges={['top']}>
      <TopNav title={title} showBack />
      <View className="flex-1">
        <EmptyState title={title} description={description} />
      </View>
    </SafeAreaView>
  );
}
