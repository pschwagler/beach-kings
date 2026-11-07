import React, { useState } from "react";
import { Pressable, View } from "react-native";
import type { useScoresheetScreen } from "./useScoresheetScreen";
import AppText from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import SessionDateField from "@/components/screens/Sessions/SessionDateField";
import SessionSeasonSelector from "@/components/screens/Sessions/SessionSeasonSelector";

type ViewModel = ReturnType<typeof useScoresheetScreen>;

export default function ScoresheetContextFields({
  vm,
}: {
  readonly vm: ViewModel;
}): React.ReactNode {
  const [choosingLeague, setChoosingLeague] = useState(vm.leagueId === 0);
  const [choosingSeason, setChoosingSeason] = useState(false);
  const selectedSeason = vm.seasons.data?.find(
    (season) => season.id === vm.seasonId,
  );
  const choose = (id: number) => {
    vm.chooseLeague(id);
    setChoosingLeague(false);
    setChoosingSeason(false);
  };
  return (
    <View className="rounded-card border border-divider bg-surface p-3 gap-3">
      {!vm.uploaded && (
        <View className="gap-3">
          <AppText className="text-body font-bold text-default">
            Are these league or pickup games?
          </AppText>
          <View className="flex-row gap-3" accessibilityRole="radiogroup">
            {(["league", "pickup"] as const).map((type) => (
              <Pressable
                key={type}
                testID={`scoresheet-type-${type}`}
                accessibilityRole="radio"
                accessibilityLabel={
                  type === "league" ? "League games" : "Pickup games"
                }
                accessibilityState={{ selected: vm.gameType === type }}
                disabled={vm.busy}
                onPress={() => vm.chooseGameType(type)}
                className={`flex-1 min-h-touch p-3 rounded-card border ${vm.gameType === type ? "bg-info-tint border-brand-teal" : "bg-surface border-divider"}`}
              >
                <AppText className="text-body font-semibold text-default">
                  {type === "league" ? "League" : "Pickup"}
                </AppText>
                <AppText className="text-caption text-muted">
                  {type === "league" ? "Choose a league" : "No league needed"}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      {!vm.uploaded && vm.gameType === "league" ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setChoosingLeague(!choosingLeague)}
            disabled={vm.busy}
            className="min-h-touch justify-center"
          >
            <AppText className="text-caption text-muted">League</AppText>
            <View className="flex-row items-center justify-between gap-2">
              <AppText className="text-body font-semibold text-default flex-1">
                {vm.leagueId > 0
                  ? (vm.league?.name ?? "Loading league…")
                  : "Choose a league"}
              </AppText>
              <AppText className="text-caption text-brand-teal">Change</AppText>
            </View>
          </Pressable>
          {choosingLeague && (
            <View className="gap-2">
              {(vm.leagues.data ?? []).map((league) => (
                <Pressable
                  key={league.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: vm.leagueId === league.id }}
                  disabled={vm.busy}
                  onPress={() => choose(league.id)}
                  className={`min-h-touch p-3 rounded-card border ${vm.leagueId === league.id ? "bg-info-tint border-brand-teal" : "bg-surface border-divider"}`}
                >
                  <AppText className="text-body text-default">
                    {league.name}
                  </AppText>
                </Pressable>
              ))}
              {vm.leagues.isLoading && (
                <AppText className="text-caption text-muted">
                  Loading your leagues…
                </AppText>
              )}
              {vm.leagues.isSuccess && vm.leagues.data.length === 0 && (
                <AppText className="text-caption text-muted">
                  You have no leagues yet. Choose Pickup to record games without
                  a league.
                </AppText>
              )}
              {vm.leagues.isError && (
                <Button
                  title="Retry loading leagues"
                  variant="outline"
                  onPress={() => {
                    void vm.leagues.refetch();
                  }}
                />
              )}
            </View>
          )}
        </>
      ) : vm.uploaded ? (
        <AppText className="text-body font-bold text-default">
          {vm.leagueId > 0 ? vm.league?.name : "Pickup games"}
        </AppText>
      ) : null}
      {vm.contextReady && (
        <SessionDateField
          value={vm.date}
          onChange={vm.setDate}
          testID="scoresheet-date"
        />
      )}
      {vm.leagueId > 0 && (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setChoosingSeason(!choosingSeason)}
            disabled={vm.busy}
            className="min-h-touch justify-center"
          >
            <AppText className="text-caption text-muted">Season</AppText>
            <AppText className="text-body text-brand-teal">
              {vm.seasonId == null
                ? "No season"
                : (selectedSeason?.name ?? "Loading season…")}{" "}
              · Change
            </AppText>
          </Pressable>
          {vm.seasons.isError && (
            <Button
              title="Retry loading seasons"
              variant="outline"
              onPress={() => {
                void vm.seasons.refetch();
              }}
            />
          )}
          {choosingSeason && vm.seasons.isSuccess && (
            <SessionSeasonSelector
              seasons={vm.seasons.data}
              selectedSeasonId={vm.seasonId}
              onChange={(id) => {
                vm.setSeasonId(id);
                setChoosingSeason(false);
              }}
              testIDPrefix="scoresheet"
            />
          )}
        </>
      )}
    </View>
  );
}
