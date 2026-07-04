/**
 * SocialScreen — the Social hub with a 4-tab subnav.
 *
 * Layout decision: a `SocialSubnav` (Messages · Notifications · Friends · Find
 * Players) matching the wireframe's `.social-subnav`, replacing the earlier
 * 2-segment ("Messages" | "Friends") control. Rationale for revisiting that
 * call: the wireframes present a single Social section that owns all four
 * destinations, so consolidating them under one subnav (rather than scattering
 * Notifications/Find Players across separate stack routes) is the parity target.
 *
 * Each tab mounts a thin container that owns its own data hook, so only the
 * active tab fetches. The extracted, chrome-free bodies are shared with the
 * standalone stack routes (Messages/Notifications), which keep their TopNav
 * chrome. Friends and Find Players show a transitional placeholder until their
 * inline bodies land (Phases 2 and 3 of the social-hub parity plan).
 *
 * A `?tab=` param lets Home header shortcuts and deep links land on a specific
 * subnav tab; it defaults to `messages`.
 *
 * Wireframe refs: messages.html / notifications.html / friends.html /
 * find-players.html `.social-subnav`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { routes, type SocialTab } from '@/lib/navigation';
import TopNav from '@/components/ui/TopNav';
import SocialSubnav from './SocialSubnav';
import MessagesTab from './MessagesTab';
import NotificationsTab from './NotificationsTab';
import FriendsShortcut from './FriendsShortcut';

const DEFAULT_TAB: SocialTab = 'messages';
const VALID_TABS: readonly SocialTab[] = [
  'messages',
  'notifications',
  'friends',
  'findplayers',
];

/** Coerce a raw `?tab=` param to a known SocialTab, or null when unrecognized. */
function normalizeTab(raw: string | string[] | undefined): SocialTab | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return VALID_TABS.includes(value as SocialTab) ? (value as SocialTab) : null;
}

export default function SocialScreen(): React.ReactNode {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const paramTab = normalizeTab(params.tab);

  const [activeTab, setActiveTab] = useState<SocialTab>(paramTab ?? DEFAULT_TAB);

  // Sync to the `?tab=` param when it changes (e.g. a deep link arriving while
  // the screen is already mounted). Functional update leaves in-app tab taps
  // untouched — this only fires when the param itself changes.
  useEffect(() => {
    if (paramTab != null) {
      setActiveTab((prev) => (paramTab !== prev ? paramTab : prev));
    }
  }, [paramTab]);

  const handleFindPlayers = useCallback(() => {
    router.push(routes.findPlayers());
  }, [router]);

  function renderBody(): React.ReactNode {
    switch (activeTab) {
      case 'messages':
        return <MessagesTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'friends':
      case 'findplayers':
        // Transitional placeholder until FriendsBody (Phase 2) and
        // FindPlayersBody (Phase 3) render inline content.
        return <FriendsShortcut onFindPlayers={handleFindPlayers} />;
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav title="Social" />
      <SocialSubnav activeTab={activeTab} onTabPress={setActiveTab} />
      <View testID="social-body" className="flex-1">
        {renderBody()}
      </View>
    </SafeAreaView>
  );
}
