import React, { useState } from "react";
import { View } from "react-native";
import type { ScoresheetMatch } from "@beach-kings/api-client";
import AppText from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import ScoresheetPlayerPicker from "./ScoresheetPlayerPicker";

export default function ScoresheetReview({
  matches,
  unresolved,
  leagueId,
  onResolve,
  disabled,
}: {
  readonly matches: readonly ScoresheetMatch[];
  readonly unresolved: readonly string[];
  readonly leagueId: number;
  readonly onResolve: (raw: string, id: number, name: string) => void;
  readonly disabled: boolean;
}): React.ReactNode {
  const [resolving, setResolving] = useState<string | null>(null);
  return (
    <View className="gap-3">
      {matches.map((match) => (
        <View
          key={match.number}
          className="rounded-card border border-divider bg-surface p-4 gap-3"
        >
          <AppText className="text-caption font-bold text-muted">
            Game {match.number}
          </AppText>
          {[0, 1].map((team) => (
            <View key={team} className="flex-row items-center gap-3">
              <View className="flex-1">
                {match.players
                  .slice(team * 2, team * 2 + 2)
                  .map((player, index) => (
                    <AppText
                      key={index}
                      className={`text-body ${player.id == null ? "text-warning font-semibold" : "text-default"}`}
                    >
                      {player.name}
                      {player.id == null ? " · Match player" : ""}
                    </AppText>
                  ))}
              </View>
              <AppText
                className={`text-title3 font-bold ${match.scores[team] == null ? "text-warning" : "text-default"}`}
              >
                {match.scores[team] ?? "?"}
              </AppText>
            </View>
          ))}
        </View>
      ))}
      {unresolved.length > 0 && (
        <View className="gap-2">
          <AppText className="text-body font-bold text-default">
            Match unrecognized names
          </AppText>
          {unresolved.map((name) => (
            <View key={name}>
              <Button
                variant="outline"
                title={`“${name}” → Choose player`}
                disabled={disabled}
                onPress={() => {
                  setResolving(name);
                }}
              />
              {resolving === name && (
                <ScoresheetPlayerPicker
                  key={name}
                  leagueId={leagueId}
                  rawName={name}
                  disabled={disabled}
                  onResolve={(raw, id, fullName) => {
                    onResolve(raw, id, fullName);
                    setResolving(null);
                  }}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
