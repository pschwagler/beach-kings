import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import type { PlayerSearchItem } from "@beach-kings/shared";
import AppText from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { usePaletteColors } from "@/theme/usePaletteColors";
import { useScoresheetPlayerPicker } from "./useScoresheetPlayerPicker";

export default function ScoresheetPlayerPicker({
  leagueId,
  rawName,
  onResolve,
  disabled,
}: {
  readonly leagueId: number | null;
  readonly rawName: string;
  readonly onResolve: (raw: string, id: number, name: string) => void;
  readonly disabled: boolean;
}): React.ReactNode {
  const vm = useScoresheetPlayerPicker(leagueId, rawName, onResolve);
  const palette = usePaletteColors();
  const section = (title: string, players: readonly PlayerSearchItem[]) =>
    players.length > 0 && (
      <View className="gap-1">
        <AppText className="text-caption font-bold text-muted">{title}</AppText>
        {players.map((player) => (
          <Pressable
            key={player.id}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => vm.select(player)}
            className="min-h-touch justify-center border-b border-divider py-2"
          >
            <AppText className="text-body text-brand-teal">
              {player.full_name ??
                `${player.first_name} ${player.last_name}`.trim()}
            </AppText>
            {player.nickname && (
              <AppText className="text-caption text-muted">
                {player.nickname}
              </AppText>
            )}
          </Pressable>
        ))}
      </View>
    );
  return (
    <View className="bg-surface p-3 rounded-card gap-3 mt-2">
      <Input
        value={vm.search}
        onChangeText={vm.setSearch}
        placeholder="Search players"
        testID="scoresheet-player-search"
      />
      {vm.isLoading && (
        <ActivityIndicator
          accessibilityLabel="Searching players"
          color={palette.brandTeal}
        />
      )}
      {vm.error && (
        <Button
          title="Retry player search"
          variant="outline"
          onPress={() => {
            void vm.retry();
          }}
        />
      )}
      {!vm.isLoading && !vm.error && (
        <>
          {section("League players", vm.leaguePlayers)}
          {section(
            leagueId == null ? "Players" : "Other players",
            vm.otherPlayers,
          )}
          {vm.leaguePlayers.length === 0 && vm.otherPlayers.length === 0 && (
            <AppText className="text-body text-muted">
              No matching players found.
            </AppText>
          )}
        </>
      )}
      <Button
        title={`Add “${vm.search.trim() || rawName}” as a new player`}
        variant="outline"
        disabled={disabled}
        onPress={vm.create}
        testID="scoresheet-create-player"
      />
    </View>
  );
}
