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
import { View, Text, Pressable } from "react-native";
import { hapticLight } from "@/utils/haptics";
import type { SocialTab } from "@/lib/navigation";

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
    <View
      testID="social-subnav"
      accessibilityRole="tablist"
      className="flex-row bg-surface border-b border-divider px-4"
    >
      {TABS.map(({ key, label }) => {
        const isActive = key === activeTab;
        return (
          <Pressable
            key={key}
            testID={`social-subnav-tab-${key}`}
            onPress={() => {
              void hapticLight();
              onTabPress(key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
            className="flex-1 min-h-[44px] py-3 items-center justify-center"
          >
            <Text
              numberOfLines={1}
              className={`text-[13px] font-semibold ${
                isActive ? "text-brand-teal" : "text-muted"
              }`}
            >
              {label}
            </Text>
            {isActive && (
              <View className="absolute bottom-0 left-2 right-2 h-[2px] bg-brand-teal" />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
