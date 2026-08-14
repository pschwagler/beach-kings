/**
 * SocialSubnav — 4-tab subnavigation for the Social hub.
 *
 * Tabs: Messages · Notifications · Friends · Find Players.
 *
 * Mirrors the wireframe's `.social-subnav` (13px semibold labels, the active
 * tab colored with a brand-teal underline, 44px min tap targets). Purely
 * presentational: the active tab and switching behavior are owned by the
 * parent (SocialScreen) so this component stays reusable and easy to test.
 *
 * Wireframe ref: friends.html / messages.html `.social-subnav`.
 */

import React from "react";
import { hapticLight } from "@/utils/haptics";
import type { SocialTab } from "@/lib/navigation";
import TabView from '@/components/ui/TabView';

/**
 * The four destinations reachable from the Social hub subnav. Re-exported from
 * the canonical definition in `@/lib/navigation` so importers of this component
 * can keep pulling the type from here.
 */
export type { SocialTab };

const TABS: ReadonlyArray<{ readonly key: SocialTab; readonly label: string }> =
  [
    { key: "messages", label: "Messages" },
    { key: "notifications", label: "Notifications" },
    { key: "friends", label: "Friends" },
    { key: "findplayers", label: "Find Players" },
  ];

interface SocialSubnavProps {
  readonly activeTab: SocialTab;
  readonly onTabPress: (tab: SocialTab) => void;
}

export default function SocialSubnav({
  activeTab,
  onTabPress,
}: SocialSubnavProps): React.ReactNode {
  return (
    <TabView<SocialTab>
      testID="social-subnav"
      items={TABS.map(({ key, label }) => ({
        value: key,
        label,
        testID: `social-subnav-tab-${key}`,
      }))}
      value={activeTab}
      onValueChange={(value) => {
        void hapticLight();
        onTabPress(value);
      }}
    />
  );
}
