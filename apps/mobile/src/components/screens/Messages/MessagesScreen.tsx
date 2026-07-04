/**
 * MessagesScreen — standalone inbox route.
 *
 * Owns the page chrome (SafeAreaView + TopNav with the compose action) and the
 * `useMessagesScreen` data hook, then delegates the actual inbox content to the
 * chrome-free {@link MessagesBody}. The same body renders inside the Social hub
 * subnav, so all list/state/search markup lives there — not here.
 *
 * Wireframe ref: messages.html
 */

import React from 'react';
import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import TopNav from '@/components/ui/TopNav';
import { routes } from '@/lib/navigation';
import { useMessagesScreen } from './useMessagesScreen';
import MessagesBody from './MessagesBody';

export default function MessagesScreen(): React.ReactNode {
  const router = useRouter();
  const state = useMessagesScreen();

  const composeAction = (
    <Pressable
      testID="messages-compose-btn"
      onPress={() => router.push('/(stack)/find-players')}
      accessibilityRole="button"
      accessibilityLabel="Start a new conversation"
      className="min-w-touch min-h-touch items-center justify-center active:opacity-70"
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav
        title="Messages"
        showBack
        backFallback={routes.home()}
        rightAction={composeAction}
      />
      <MessagesBody {...state} />
    </SafeAreaView>
  );
}
