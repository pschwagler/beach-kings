import React, { useState } from "react";
import { Pressable, View } from "react-native";
import type { ScoresheetMatch } from "@beach-kings/api-client";
import AppText from "@/components/ui/AppText";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { scoresheetReviewIssue } from "@/features/scoresheets/review";
import ScoresheetPlayerPicker from "./ScoresheetPlayerPicker";

export default function ScoresheetGameEditor({
  match,
  leagueId,
  onSave,
  onCancel,
}: {
  readonly match: ScoresheetMatch;
  readonly leagueId: number | null;
  readonly onSave: (
    match: ScoresheetMatch,
    selectedIds: readonly number[],
  ) => void;
  readonly onCancel: () => void;
}) {
  const [players, setPlayers] = useState(match.players);
  const [scores, setScores] = useState<[string, string]>([
    String(match.scores[0] ?? ""),
    String(match.scores[1] ?? ""),
  ]);
  const [slot, setSlot] = useState<number | null>(null);
  const [selected, setSelected] = useState<readonly number[]>([]);
  const parsed = scores.map((score) =>
    /^\d+$/.test(score) ? Number(score) : null,
  ) as [number | null, number | null];
  const draft = { ...match, players, scores: parsed };
  const issue = scoresheetReviewIssue([draft]);
  return (
    <View
      testID={`scoresheet-edit-game-${match.number}`}
      className="gap-3 border-t border-divider pt-3 mt-2"
    >
      {[0, 1].map((team) => (
        <View key={team} className="gap-2">
          <AppText className="text-caption font-bold text-muted">
            Team {team + 1}
          </AppText>
          {players.slice(team * 2, team * 2 + 2).map((player, index) => {
            const position = team * 2 + index;
            return (
              <Pressable
                key={position}
                accessibilityRole="button"
                accessibilityLabel={`Change team ${team + 1} player ${index + 1}: ${player.name}`}
                onPress={() => setSlot(slot === position ? null : position)}
                className="min-h-touch flex-row items-center justify-between gap-2 px-2 bg-elevated rounded-lg"
              >
                <AppText
                  className={`text-body flex-1 ${selected.includes(player.id ?? 0) ? "text-success" : "text-default"}`}
                >
                  {player.name}
                </AppText>
                <AppText className="text-caption text-brand-teal">
                  Change
                </AppText>
              </Pressable>
            );
          })}
          {slot != null && Math.floor(slot / 2) === team && (
            <ScoresheetPlayerPicker
              key={slot}
              leagueId={leagueId}
              rawName={players[slot]?.rawName || players[slot]?.name || ""}
              disabled={false}
              onResolve={(_raw, id, name) => {
                setPlayers((current) =>
                  current.map((player, index) =>
                    index === slot ? { ...player, id, name } : player,
                  ),
                );
                setSelected((current) => [...new Set([...current, id])]);
                setSlot(null);
              }}
            />
          )}
          <AppText className="text-caption text-muted">
            Team {team + 1} score
          </AppText>
          <Input
            testID={`scoresheet-game-${match.number}-score-${team + 1}`}
            keyboardType="number-pad"
            value={scores[team]!}
            onChangeText={(value) =>
              setScores((current) =>
                team === 0 ? [value, current[1]] : [current[0], value],
              )
            }
          />
        </View>
      ))}
      {issue && (
        <AppText
          accessibilityLiveRegion="polite"
          className="text-caption text-warning"
        >
          {issue}
        </AppText>
      )}
      <View className="flex-row gap-3">
        <Button
          title="Cancel"
          variant="outline"
          className="flex-1"
          onPress={onCancel}
        />
        <Button
          title="Save changes"
          className="flex-1"
          disabled={issue != null}
          onPress={() => onSave(draft, selected)}
        />
      </View>
      <AppText className="text-caption text-muted">
        Changes stay in this review until you add the games.
      </AppText>
    </View>
  );
}
