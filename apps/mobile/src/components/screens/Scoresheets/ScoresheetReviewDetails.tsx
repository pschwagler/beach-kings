import React, { useState } from "react";
import { Pressable, View } from "react-native";
import AppText from "@/components/ui/AppText";
import ScoresheetContextFields from "./ScoresheetContextFields";
import type { useScoresheetScreen } from "./useScoresheetScreen";

export default function ScoresheetReviewDetails({
  vm,
}: {
  readonly vm: ReturnType<typeof useScoresheetScreen>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="border border-divider rounded-card bg-surface p-3 gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        className="min-h-touch justify-center gap-1"
      >
        <View className="flex-row justify-between gap-2">
          <AppText className="text-body font-semibold text-default">
            Date, court & league
          </AppText>
          <AppText className="text-caption text-brand-teal">
            {open ? "Hide" : "Change"}
          </AppText>
        </View>
        <AppText className="text-caption text-muted">
          {vm.date} · {vm.courtName ?? "Court optional"} ·{" "}
          {vm.league?.name ?? "Pickup"}
        </AppText>
      </Pressable>
      {open && <ScoresheetContextFields vm={vm} />}
    </View>
  );
}
