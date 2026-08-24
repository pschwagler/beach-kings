/** Standalone global notification inbox for bell, push, and deep links. */

import React, { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import NotificationsTab from '@/components/screens/Social/NotificationsTab';

export default function NotificationsRoute(): React.ReactNode {
  const [headerAction, setHeaderAction] = useState<React.ReactNode>(null);
  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav
        title="Notifications"
        showBack
        rightAction={headerAction ?? undefined}
      />
      <View className="flex-1" testID="standalone-notifications-screen">
        <NotificationsTab setHeaderAction={setHeaderAction} />
      </View>
    </SafeAreaView>
  );
}
