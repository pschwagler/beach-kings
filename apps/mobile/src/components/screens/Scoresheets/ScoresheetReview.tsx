import React, { useState } from "react";
import { Pressable, View } from "react-native";
import type {
  PhotoPlayerOverride,
  ScoresheetMatch,
} from "@beach-kings/api-client";
import AppText from "@/components/ui/AppText";
import ScoresheetPlayerPicker from "./ScoresheetPlayerPicker";
import ScoresheetGameEditor from "./ScoresheetGameEditor";

export default function ScoresheetReview({
  matches,
  unresolved,
  leagueId,
  onResolve,
  onEdit,
  manualChoices,
  selectedIds,
  disabled,
  onEditingChange,
}: {
  readonly matches: readonly ScoresheetMatch[];
  readonly unresolved: readonly string[];
  readonly leagueId: number | null;
  readonly onResolve: (raw: string, id: number, name: string) => void;
  readonly onEdit: (
    match: ScoresheetMatch,
    selectedIds: readonly number[],
  ) => void;
  readonly manualChoices: readonly PhotoPlayerOverride[];
  readonly selectedIds: readonly number[];
  readonly disabled: boolean;
  readonly onEditingChange: (editing: boolean) => void;
}) {
  const [resolving, setResolving] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const chosen = manualChoices.filter((choice) =>
    matches.some((match) =>
      match.players.some((player) => player.id === choice.player_id),
    ),
  );
  const activeName = resolving ?? unresolved[0] ?? null;
  const setEditor = (number: number | null) => {
    setEditing(number);
    onEditingChange(number != null);
  };
  return (
    <View className="gap-3">
      {(unresolved.length > 0 || chosen.length > 0) && (
        <View
          testID="scoresheet-player-matching"
          className="rounded-card bg-surface border border-divider p-3 gap-2"
        >
          <AppText className="text-body font-bold text-default">
            {unresolved.length
              ? `Match ${unresolved.length} player ${unresolved.length === 1 ? "name" : "names"}`
              : "Players matched"}
          </AppText>
          {unresolved.length > 0 && (
            <AppText className="text-caption text-muted">
              Choose who each name refers to. Your choice updates every game
              using that name.
            </AppText>
          )}
          {chosen.map((choice) => (
            <Pressable
              key={choice.raw_name}
              accessibilityRole="button"
              accessibilityLabel={`Change selected player for ${choice.raw_name}: ${choice.player_name}`}
              onPress={() => setResolving(choice.raw_name)}
              disabled={disabled || editing != null}
              className="min-h-touch bg-success-tint rounded-lg px-3 justify-center"
            >
              <AppText className="text-body font-semibold text-success">
                {choice.raw_name} → {choice.player_name} ✓
              </AppText>
            </Pressable>
          ))}
          {unresolved.map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={`Match player ${name}`}
              disabled={disabled || editing != null}
              onPress={() => setResolving(name)}
              className="min-h-touch flex-row items-center justify-between gap-2 px-3 bg-warning-tint rounded-lg"
            >
              <AppText className="text-body font-semibold text-warning">
                {name}
              </AppText>
              <AppText className="text-caption text-brand-teal">
                Choose player ›
              </AppText>
            </Pressable>
          ))}
          {activeName != null && (
            <ScoresheetPlayerPicker
              key={activeName}
              leagueId={leagueId}
              rawName={activeName}
              disabled={disabled || editing != null}
              onResolve={(raw, id, name) => {
                onResolve(raw, id, name);
                setResolving(null);
              }}
            />
          )}
        </View>
      )}
      {matches.map((match) => {
        const [a, b] = match.scores;
        const winner =
          a != null && b != null && a !== b ? (a > b ? 0 : 1) : null;
        return (
          <View
            key={match.number}
            testID={`scoresheet-game-${match.number}`}
            className="rounded-card border border-divider bg-surface p-3"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit game ${match.number}`}
              disabled={
                disabled || (editing != null && editing !== match.number)
              }
              onPress={() =>
                setEditor(editing === match.number ? null : match.number)
              }
              hitSlop={{ top: 10, bottom: 10 }}
              className="min-h-[24px] flex-row items-center justify-between mb-2"
            >
              <AppText className="text-[12px] font-semibold text-muted">
                Game {match.number}
              </AppText>
              <AppText className="text-[12px] font-semibold text-brand-teal">
                {editing === match.number ? "Close editor" : "Edit game ›"}
              </AppText>
            </Pressable>
            {[0, 1].map((team) => (
              <View
                key={team}
                className={`flex-row items-center gap-2 px-2 py-[7px] rounded-lg ${winner === team ? "bg-success-tint" : ""}`}
              >
                <AppText
                  className="text-[13px] leading-[18px] font-semibold text-default flex-1"
                  numberOfLines={2}
                >
                  {match.players
                    .slice(team * 2, team * 2 + 2)
                    .map((player, index) => (
                      <AppText key={`${team}-${player.id ?? player.rawName}`}>
                        {index > 0 ? " / " : ""}
                        <AppText
                          className={
                            player.id == null
                              ? "text-warning"
                              : selectedIds.includes(player.id)
                                ? "text-success"
                                : winner != null && winner !== team
                                  ? "text-muted"
                                  : "text-default"
                          }
                        >
                          {player.name}
                          {selectedIds.includes(player.id ?? 0) ? " ✓" : ""}
                        </AppText>
                      </AppText>
                    ))}
                </AppText>
                <AppText
                  className={`text-[18px] font-bold ${winner === team ? "text-success" : "text-muted"}`}
                >
                  {match.scores[team] ?? "?"}
                </AppText>
              </View>
            ))}
            {editing === match.number && (
              <ScoresheetGameEditor
                key={match.number}
                match={match}
                leagueId={leagueId}
                onCancel={() => setEditor(null)}
                onSave={(draft, ids) => {
                  onEdit(draft, ids);
                  setEditor(null);
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
