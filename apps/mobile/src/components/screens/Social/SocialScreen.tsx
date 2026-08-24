/**
 * SocialScreen — the Social hub with a 3-tab subnav.
 *
 * `SocialSubnav` owns Messages, Friends, and Find Players. Notifications is a
 * standalone global inbox because its bell, push, and deep-link entry points
 * sit outside Social.
 *
 * Each tab mounts a thin container that owns its own data hook, so only the
 * active tab fetches. The extracted, chrome-free bodies are shared with the
 * standalone stack routes (Messages/Notifications), which keep their TopNav
 * chrome. The three tabs render real inline content: Messages,
 * Friends, and the discover-only Find Players body
 * (Phase 3 of the social-hub parity plan).
 *
 * A `?tab=` param lets Home header shortcuts and deep links land on a specific
 * subnav tab; it defaults to `messages`.
 *
 * Wireframe refs: messages.html / notifications.html / friends.html /
 * find-players.html `.social-subnav`.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import { routes, type SocialTab } from "@/lib/navigation";
import TopNav from "@/components/ui/TopNav";
import SocialSubnav from "./SocialSubnav";
import MessagesTab from "./MessagesTab";
import FriendsTab from "./FriendsTab";
import FindPlayersTab from "./FindPlayersTab";
import { registerRootTabScroll } from '@/lib/rootTabScroll';

const DEFAULT_TAB: SocialTab = "messages";
const VALID_TABS: readonly SocialTab[] = [
  "messages",
  "friends",
  "findplayers",
];

/** Coerce a raw `?tab=` param to a known SocialTab, or null when unrecognized. */
function normalizeTab(raw: string | string[] | undefined): SocialTab | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return VALID_TABS.includes(value as SocialTab) ? (value as SocialTab) : null;
}

export default function SocialScreen(): React.ReactNode {
  const params = useLocalSearchParams<{ tab?: string }>();
  const rawParamTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const paramTab = normalizeTab(params.tab);

  const [activeTab, setActiveTab] = useState<SocialTab>(
    paramTab ?? DEFAULT_TAB,
  );

  // Per-tab right action for the single "Social" TopNav. The active tab publishes
  // its action (compose / mark-all) via `setHeaderAction` and clears it on unmount,
  // so consolidating the standalone screens into the hub doesn't drop their
  // header controls. Only one tab is mounted at a time (lazy per-tab fetch), so
  // there's never a race between two tabs' actions.
  const [headerAction, setHeaderAction] = useState<React.ReactNode>(null);
  const [scrollRequest, setScrollRequest] = useState(0);

  useEffect(
    () => registerRootTabScroll('social', () => {
      setScrollRequest((value) => value + 1);
    }),
    [],
  );

  // Sync to the `?tab=` param when it changes (e.g. a deep link arriving while
  // the screen is already mounted). Functional update leaves in-app tab taps
  // untouched — this only fires when the param itself changes.
  useEffect(() => {
    if (paramTab != null) {
      setActiveTab((prev) => (paramTab !== prev ? paramTab : prev));
    }
  }, [paramTab]);

  // In-hub navigation: switch the subnav in place rather than pushing a screen.
  const goToFindPlayers = useCallback(() => setActiveTab("findplayers"), []);

  function renderBody(): React.ReactNode {
    switch (activeTab) {
      case "messages":
        return (
          <MessagesTab
            setHeaderAction={setHeaderAction}
            onCompose={goToFindPlayers}
            scrollRequest={scrollRequest}
          />
        );
      case "friends":
        return <FriendsTab onFindPlayers={goToFindPlayers} scrollRequest={scrollRequest} />;
      case "findplayers":
        return <FindPlayersTab scrollRequest={scrollRequest} />;
    }
  }

  // Preserve previously issued Social notification URLs while keeping one
  // canonical global inbox destination.
  if (rawParamTab === 'notifications') {
    return <Redirect href={routes.notifications()} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      <TopNav title="Social" rightAction={headerAction ?? undefined} />
      <SocialSubnav activeTab={activeTab} onTabPress={setActiveTab} />
      <View testID="social-body" className="flex-1">
        {renderBody()}
      </View>
    </SafeAreaView>
  );
}
