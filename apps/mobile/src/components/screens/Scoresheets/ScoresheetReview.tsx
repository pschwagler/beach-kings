import React, { useState } from "react";
import { View, Pressable } from "react-native";
import type { LeagueMemberApiRow } from "@beach-kings/shared";
import type { ScoresheetMatch } from "@beach-kings/api-client";
import AppText from "@/components/ui/AppText";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function ScoresheetReview({
  matches,
  unresolved,
  members,
  onResolve,
  disabled,
}: {
  readonly matches: readonly ScoresheetMatch[];
  readonly unresolved: readonly string[];
  readonly members: readonly LeagueMemberApiRow[];
  readonly onResolve: (raw: string, id: number, name: string) => void;
  readonly disabled: boolean;
}): React.ReactNode {
  const [resolving, setResolving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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
                  setSearch("");
                }}
              />
              {resolving === name && (
                <View className="bg-surface p-3 rounded-card gap-2 mt-2">
                  <Input
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search league players"
                  />
                  {members
                    .filter((member) =>
                      (member.player_name ?? "")
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((member) => (
                      <Pressable
                        key={member.player_id}
                        disabled={disabled}
                        accessibilityRole="button"
                        className="min-h-touch justify-center border-b border-divider"
                        onPress={() => {
                          onResolve(
                            name,
                            member.player_id,
                            member.player_name ?? `Player ${member.player_id}`,
                          );
                          setResolving(null);
                        }}
                      >
                        <AppText className="text-body text-brand-teal">
                          {member.player_name ?? `Player ${member.player_id}`}
                        </AppText>
                      </Pressable>
                    ))}
                  <AppText className="text-caption text-muted">
                    Player missing? Add them to the league, or describe the
                    correct player in a correction.
                  </AppText>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
