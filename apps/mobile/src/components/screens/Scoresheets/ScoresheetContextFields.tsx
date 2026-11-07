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
  const [choosingLeague, setChoosingLeague] = useState(false);
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
      {!vm.uploaded ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setChoosingLeague(!choosingLeague)}
            disabled={vm.busy}
            className="min-h-touch justify-center"
          >
            <AppText className="text-caption text-muted">
              League (optional)
            </AppText>
            <View className="flex-row items-center justify-between gap-2">
              <AppText className="text-body font-semibold text-default flex-1">
                {vm.leagueId > 0
                  ? (vm.league?.name ?? "Loading league…")
                  : "Pickup · No league"}
              </AppText>
              <AppText className="text-caption text-brand-teal">Change</AppText>
            </View>
          </Pressable>
          {choosingLeague && (
            <View className="gap-2">
              {[
                { id: 0, name: "Pickup · No league" },
                ...(vm.leagues.data ?? []),
              ].map((league) => (
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
      ) : (
        <AppText className="text-body font-bold text-default">
          {vm.leagueId > 0 ? vm.league?.name : "Pickup games"}
        </AppText>
      )}
      <SessionDateField
        value={vm.date}
        onChange={vm.setDate}
        testID="scoresheet-date"
      />
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
