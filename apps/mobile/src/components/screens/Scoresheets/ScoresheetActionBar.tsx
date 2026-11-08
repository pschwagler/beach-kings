import React from "react";
import { ActivityIndicator, View } from "react-native";
import AppText from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import { usePaletteColors } from "@/theme/usePaletteColors";
import type { useScoresheetScreen } from "./useScoresheetScreen";

type ViewModel = ReturnType<typeof useScoresheetScreen>;

export default function ScoresheetActionBar({
  vm,
  error,
  onReplace,
}: {
  readonly vm: ViewModel;
  readonly error: string | null;
  readonly onReplace: () => void;
}): React.ReactNode {
  const palette = usePaletteColors();
  if (vm.confirmed) return null;
  const ready = vm.jobQuery.data?.status === "COMPLETED";
  const seasonPending = vm.leagueId > 0 && !vm.seasons.isSuccess;
  const hint =
    error ??
    (vm.processing
      ? "Reading names and scores. You can review them before saving."
      : !vm.uploaded
        ? !vm.photo
          ? "Choose a photo above to read its scores."
          : !vm.contextReady
            ? vm.gameType === "league"
              ? "Choose a league above, or switch to Pickup."
              : "Choose League or Pickup above to continue."
            : vm.gameType === "pickup"
              ? "Ready to read as pickup games. No league needed."
              : "Ready to read with your league’s players and your session history."
        : vm.editorOpen
          ? "Save or cancel your game edits before adding the games."
          : (vm.issue ??
            (seasonPending
              ? "Load season options above before adding league games."
              : "Checked the names and scores? Add these games to save them.")));
  return (
    <View
      testID="scoresheet-action-bar"
      className="border-t border-divider bg-surface px-4 py-3 gap-2"
    >
      <AppText
        accessibilityLiveRegion="polite"
        className={`text-caption ${error ? "text-danger" : "text-muted"}`}
      >
        {hint}
      </AppText>
      {!vm.uploaded && (
        <Button
          testID="read-scoresheet"
          title="Read scoresheet"
          variant="secondary"
          loading={vm.uploading}
          disabled={!vm.photo || !vm.contextReady || vm.busy}
          onPress={() => {
            void vm.upload();
          }}
        />
      )}
      {vm.processing && (
        <ActivityIndicator
          accessibilityLabel="Reading scoresheet"
          color={palette.brandTeal}
        />
      )}
      {ready && (
        <Button
          testID="confirm-scoresheet"
          title={`Add ${vm.matches.length} ${vm.matches.length === 1 ? "game" : "games"}`}
          variant="secondary"
          loading={vm.confirming}
          disabled={
            vm.busy || vm.editorOpen || vm.issue != null || seasonPending
          }
          onPress={() => {
            void vm.confirm();
          }}
        />
      )}
      {vm.jobQuery.isError && (
        <Button
          title="Retry checking progress"
          variant="outline"
          onPress={() => {
            void vm.jobQuery.refetch();
          }}
        />
      )}
      {vm.uploaded && !vm.processing && !ready && !vm.jobQuery.isError && (
        <Button
          title="Choose another photo"
          variant="outline"
          disabled={vm.busy}
          onPress={onReplace}
        />
      )}
    </View>
  );
}
