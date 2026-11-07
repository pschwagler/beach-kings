import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import AppText from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import TopNav from "@/components/ui/TopNav";
import SessionDateField from "@/components/screens/Sessions/SessionDateField";
import SessionSeasonSelector from "@/components/screens/Sessions/SessionSeasonSelector";
import { usePaletteColors } from "@/theme/usePaletteColors";
import { routes } from "@/lib/navigation";
import ScoresheetReview from "./ScoresheetReview";
import { useScoresheetScreen } from "./useScoresheetScreen";

export default function ScoresheetScreen({
  leagueId,
}: {
  readonly leagueId: number | null;
}): React.ReactNode {
  const vm = useScoresheetScreen(leagueId);
  const router = useRouter();
  const navigation = useNavigation();
  const palette = usePaletteColors();
  const [expanded, setExpanded] = useState(false);
  const dirty = vm.photo != null && !vm.confirmed;
  usePreventRemove(dirty || vm.busy, ({ data }) => {
    if (vm.busy) return;
    Alert.alert(
      "Leave this scoresheet?",
      "These games have not been added. Leaving discards this review.",
      [
        { text: "Keep reviewing", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });
  const error =
    vm.error ??
    (vm.jobQuery.isError
      ? "Could not check progress. Check your connection and retry."
      : null) ??
    (vm.jobQuery.data?.status === "FAILED"
      ? (vm.result?.error ??
        "This photo could not be processed. Try another photo.")
      : null);
  const ready = vm.jobQuery.data?.status === "COMPLETED";
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      className="flex-1 bg-page"
      testID="scoresheet-screen"
    >
      <TopNav
        title={vm.confirmed ? "Games Added" : "Scan Scoresheet"}
        showBack
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 16 }}
        >
          {vm.confirmed ? (
            <View className="gap-4 py-8">
              <AppText
                accessibilityRole="header"
                className="text-title2 font-bold text-default"
              >
                {vm.savedCount} {vm.savedCount === 1 ? "game" : "games"} added
              </AppText>
              <AppText className="text-body text-muted">
                Your scores are saved in {vm.league?.name}. Open the league to
                review the session.
              </AppText>
              <Button
                title="View league games"
                variant="secondary"
                onPress={() =>
                  router.replace(routes.league(vm.leagueId, { tab: "games" }))
                }
              />
            </View>
          ) : (
            <>
              <AppText className="text-caption font-bold uppercase tracking-wide text-brand-teal">
                {vm.uploaded
                  ? vm.processing
                    ? "2 / 3 · Reading scores"
                    : "3 / 3 · Review games"
                  : "1 / 3 · Choose a photo"}
              </AppText>
              <AppText
                accessibilityRole="header"
                className="text-title2 font-bold text-default"
              >
                {vm.uploaded
                  ? "Check every game before adding"
                  : "A whole scoresheet. One photo."}
              </AppText>
              <AppText className="text-body text-muted">
                {vm.uploaded
                  ? "Compare names and scores with your photo. Nothing is recorded until you tap Add games."
                  : "Scan league 2v2 scores from paper or a whiteboard. Keep all names and scores in focus."}
              </AppText>
              {vm.photo != null && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    expanded
                      ? "Shrink scoresheet photo"
                      : "Expand scoresheet photo"
                  }
                  onPress={() => setExpanded(!expanded)}
                >
                  <Image
                    source={{ uri: vm.photo.uri }}
                    resizeMode="contain"
                    accessibilityLabel="Selected scoresheet"
                    style={{ height: expanded ? 480 : 180, width: "100%" }}
                    className="rounded-card bg-elevated"
                  />
                  <AppText className="text-caption text-brand-teal mt-2">
                    {expanded ? "Tap to shrink photo" : "Tap to enlarge photo"}
                  </AppText>
                </Pressable>
              )}
              {!vm.uploaded && (
                <>
                  <View className="flex-row gap-3">
                    <Button
                      title="Take photo"
                      variant="secondary"
                      className="flex-1"
                      disabled={vm.busy}
                      onPress={() => {
                        void vm.choosePhoto(true);
                      }}
                    />
                    <Button
                      title={vm.photo ? "Change photo" : "Photo library"}
                      variant="outline"
                      className="flex-1"
                      disabled={vm.busy}
                      onPress={() => {
                        void vm.choosePhoto(false);
                      }}
                    />
                  </View>
                  <AppText className="text-caption text-muted">
                    JPEG, PNG, or HEIC · Up to 10 MB
                  </AppText>
                  <AppText className="text-body font-bold text-default">
                    League
                  </AppText>
                  {vm.leagues.isPending && (
                    <ActivityIndicator color={palette.brandTeal} />
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
                  {vm.leagues.isSuccess && !vm.leagues.data?.length && (
                    <View className="gap-3">
                      <AppText className="text-body text-muted">
                        Join a league to scan scoresheets.
                      </AppText>
                      <Button
                        title="Find leagues"
                        variant="outline"
                        onPress={() => router.push(routes.findLeagues())}
                      />
                    </View>
                  )}
                  {vm.leagues.data?.map((league) => (
                    <Pressable
                      key={league.id}
                      disabled={vm.busy}
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: vm.leagueId === league.id,
                      }}
                      onPress={() => vm.chooseLeague(league.id)}
                      className={`min-h-touch p-3 rounded-card border ${vm.leagueId === league.id ? "bg-info-tint border-brand-teal" : "bg-surface border-divider"}`}
                    >
                      <AppText className="text-body font-semibold text-default">
                        {league.name}
                      </AppText>
                    </Pressable>
                  ))}
                </>
              )}
              {vm.league != null && !vm.processing && (
                <View
                  pointerEvents={vm.busy ? "none" : "auto"}
                  className="bg-surface rounded-card border border-divider p-3"
                >
                  {vm.uploaded && (
                    <AppText className="text-body font-bold text-default">
                      {vm.league.name}
                    </AppText>
                  )}
                  <SessionDateField
                    value={vm.date}
                    onChange={vm.setDate}
                    testID="scoresheet-date"
                  />
                  <AppText className="text-caption font-semibold text-muted">
                    Season
                  </AppText>
                  {vm.seasons.isPending && (
                    <ActivityIndicator color={palette.brandTeal} />
                  )}
                  {vm.seasons.isError && (
                    <Button
                      title="Retry loading seasons"
                      variant="outline"
                      onPress={() => {
                        void vm.seasons.refetch();
                      }}
                    />
                  )}
                  {vm.seasons.isSuccess && (
                    <SessionSeasonSelector
                      seasons={vm.seasons.data}
                      selectedSeasonId={vm.seasonId}
                      onChange={vm.setSeasonId}
                      testIDPrefix="scoresheet"
                    />
                  )}
                  <AppText className="text-caption text-muted mt-3">
                    Games go into this league’s session for the selected date
                    and season.
                  </AppText>
                </View>
              )}
              {!vm.uploaded && (
                <View className="gap-3">
                  <AppText className="text-body font-semibold text-default">
                    Anything we should know? (optional)
                  </AppText>
                  <Input
                    value={vm.prompt}
                    onChangeText={vm.setPrompt}
                    placeholder="E.g. the last column is the final score"
                  />
                </View>
              )}
              {vm.processing && (
                <View
                  accessibilityLiveRegion="polite"
                  className="bg-surface p-6 rounded-card items-center gap-3"
                >
                  <ActivityIndicator size="large" color={palette.brandTeal} />
                  <AppText className="text-body font-semibold text-default">
                    Reading names and scores…
                  </AppText>
                  <AppText className="text-caption text-muted text-center">
                    This may take a minute. Keep this screen open; you can
                    switch apps and return.
                  </AppText>
                </View>
              )}
              {ready && (
                <>
                  {vm.result?.clarification && (
                    <AppText className="text-body text-warning">
                      {vm.result.clarification}
                    </AppText>
                  )}
                  {vm.result?.error && (
                    <AppText className="text-body text-warning">
                      {vm.result.error}
                    </AppText>
                  )}
                  <ScoresheetReview
                    matches={vm.matches}
                    unresolved={vm.unresolved}
                    leagueId={vm.leagueId}
                    onResolve={vm.resolve}
                    disabled={vm.busy}
                  />
                  {vm.issue && (
                    <AppText
                      accessibilityLiveRegion="polite"
                      className="text-body text-warning"
                    >
                      {vm.issue}
                    </AppText>
                  )}
                  <View className="gap-3">
                    <AppText className="text-body font-bold text-default">
                      Need a correction?
                    </AppText>
                    <Input
                      value={vm.editPrompt}
                      onChangeText={vm.setEditPrompt}
                      placeholder="E.g. game 2 finished 21–18"
                    />
                    <Button
                      title="Apply correction"
                      variant="outline"
                      disabled={vm.busy || !vm.editPrompt.trim()}
                      onPress={() => {
                        void vm.edit();
                      }}
                    />
                  </View>
                </>
              )}
              {error && (
                <View
                  accessibilityLiveRegion="polite"
                  className="gap-3 bg-danger-tint p-4 rounded-card"
                >
                  <AppText className="text-body text-danger">{error}</AppText>
                  {vm.jobQuery.isError && (
                    <Button
                      title="Retry checking progress"
                      variant="outline"
                      onPress={() => {
                        void vm.jobQuery.refetch();
                      }}
                    />
                  )}
                </View>
              )}
              {!vm.uploaded && (
                <Button
                  title="Read scoresheet"
                  variant="secondary"
                  loading={vm.uploading}
                  disabled={
                    vm.busy || !vm.photo || !vm.league || !vm.seasons.isSuccess
                  }
                  onPress={() => {
                    void vm.upload();
                  }}
                />
              )}
              {ready && (
                <Button
                  title={`Add ${vm.matches.length} ${vm.matches.length === 1 ? "game" : "games"}`}
                  variant="secondary"
                  loading={vm.confirming}
                  disabled={
                    vm.busy || vm.issue != null || !vm.seasons.isSuccess
                  }
                  onPress={() => {
                    void vm.confirm();
                  }}
                />
              )}
              {vm.uploaded && !vm.processing && (
                <Button
                  title="Try another photo"
                  variant="ghost"
                  disabled={vm.busy}
                  onPress={() =>
                    Alert.alert(
                      "Replace this review?",
                      "The games in this review have not been added.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Replace photo",
                          onPress: () => {
                            vm.restart();
                            void vm.choosePhoto(false);
                          },
                        },
                      ],
                    )
                  }
                />
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
