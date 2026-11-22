import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
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
import { routes } from "@/lib/navigation";
import useKeyboard from "@/hooks/useKeyboard";
import ScoresheetPhoto from "./ScoresheetPhoto";
import {
  useScoresheetPhotoSource,
  type ScoresheetPhotoSource,
} from "./useScoresheetPhotoSource";
import ScoresheetReviewDetails from "./ScoresheetReviewDetails";
import ScoresheetReview from "./ScoresheetReview";
import ScoresheetActionBar from "./ScoresheetActionBar";
import ScoresheetContextFields from "./ScoresheetContextFields";
import ScoresheetCorrectionForm from "./ScoresheetCorrectionForm";
import { useScoresheetScreen } from "./useScoresheetScreen";
import {
  scoresheetInputIssue,
  type ScoresheetField,
} from "./scoresheetValidation";

export default function ScoresheetScreen({
  leagueId,
  initialSource,
}: {
  readonly leagueId: number | null;
  readonly initialSource?: ScoresheetPhotoSource;
}): React.ReactNode {
  const vm = useScoresheetScreen(leagueId);
  const scroll = useRef<ScrollView>(null);
  const contextTop = useRef(0);
  const fieldOffsets = useRef<Partial<Record<ScoresheetField, number>>>({});
  const [validationAttempted, setValidationAttempted] = useState(false);
  const validationIssue = validationAttempted ? scoresheetInputIssue(vm) : null;
  const router = useRouter();
  const navigation = useNavigation();
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(routes.addGames());
  }, [router]);
  const { isVisible: isKeyboardVisible } = useKeyboard();
  usePreventRemove(
    (vm.photo != null && !vm.confirmed) || (vm.busy && !vm.picking),
    ({ data }) => {
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
    },
  );
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
  const anchor = useRef<View>(null);
  const replace = useRef(false);
  const chooser = useScoresheetPhotoSource(
    (source) => {
      const initial = vm.photo == null;
      const replacing = replace.current;
      replace.current = false;
      void vm.choosePhoto(source === "camera").then((outcome) => {
        if (outcome === "selected" && replacing) vm.restart();
        if (outcome === "cancelled" && initial) goBack();
      });
    },
    () => {
      replace.current = false;
      if (vm.photo == null) goBack();
    },
  );
  const openSource = useCallback(
    () => chooser.open({ anchor: findNodeHandle(anchor.current) ?? undefined }),
    [chooser],
  );
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialSource) {
      void vm.choosePhoto(initialSource === "camera").then((outcome) => {
        if (outcome === "cancelled") goBack();
      });
    } else openSource();
  }, [initialSource, vm, openSource, goBack]);
  const replacePhoto = () => {
    replace.current = true;
    chooser.open({
      anchor: findNodeHandle(anchor.current) ?? undefined,
      title: "Replace scoresheet photo",
      message: "Choose a new photo to start a fresh review.",
    });
  };
  const read = () => {
    if (vm.busy) return;
    setValidationAttempted(true);
    const issue = scoresheetInputIssue(vm);
    if (issue) {
      AccessibilityInfo.announceForAccessibility(issue.message);
      if (issue.field === "photo") openSource();
      else
        scroll.current?.scrollTo({
          y: Math.max(
            0,
            contextTop.current + (fieldOffsets.current[issue.field] ?? 0) - 16,
          ),
          animated: true,
        });
      return;
    }
    void vm.upload();
  };
  if (vm.photo == null)
    return (
      <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-page">
        <TopNav title="Scan Scoresheet" showBack onBack={goBack} />
        <View ref={anchor} className="flex-1 justify-center px-6 gap-4">
          {vm.picking ? (
            <ActivityIndicator accessibilityLabel="Opening photo picker" />
          ) : (
            <>
              <AppText className="text-body text-muted">
                Take a photo of your sheet with written scores and we'll load
                the games from it. You'll get a chance to change anything that's
                incorrect and choose where it was played and if it's part of a
                league.
              </AppText>
              {vm.error && (
                <AppText
                  accessibilityRole="alert"
                  className="text-body text-danger"
                >
                  {vm.error}
                </AppText>
              )}
              {vm.cameraAccessDenied && (
                <Button
                  title="Choose from photos"
                  onPress={() => {
                    void vm.choosePhoto(false);
                  }}
                />
              )}
              <Button
                title={
                  vm.cameraAccessDenied ? "Other photo options" : "Choose photo"
                }
                variant={vm.cameraAccessDenied ? "outline" : "primary"}
                onPress={openSource}
              />
            </>
          )}
        </View>
        {chooser.sheet}
      </SafeAreaView>
    );
  return (
    <SafeAreaView
      ref={anchor}
      edges={["top", "bottom"]}
      className="flex-1 bg-page"
      testID="scoresheet-screen"
    >
      <TopNav
        title={vm.confirmed ? "Games Added" : "Scan Scoresheet"}
        showBack
        onBack={goBack}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {vm.uploaded && !vm.confirmed && vm.photo && (
          <ScoresheetPhoto
            uri={vm.photo.uri}
            docked
            compact={isKeyboardVisible}
          />
        )}
        <ScrollView
          ref={scroll}
          testID="scoresheet-content"
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}
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
                {vm.leagueId > 0
                  ? `Your scores are saved in ${vm.league?.name}.`
                  : "Your scores are saved in a pickup session."}
              </AppText>
              <Button
                title={vm.leagueId > 0 ? "View league games" : "View games"}
                variant="secondary"
                onPress={() =>
                  router.replace(
                    vm.leagueId > 0
                      ? routes.league(vm.leagueId, { tab: "games" })
                      : vm.savedSessionId != null
                        ? routes.session(vm.savedSessionId)
                        : routes.myGames(),
                  )
                }
              />
            </View>
          ) : (
            <>
              <AppText className="text-caption font-bold uppercase tracking-wide text-brand-teal">
                {vm.uploaded
                  ? vm.processing
                    ? "3 / 3 · Reading scores"
                    : "3 / 3 · Review games"
                  : vm.photo
                    ? "2 / 3 · Choose game type"
                    : "1 / 3 · Choose a photo"}
              </AppText>
              {!ready && (
                <AppText
                  accessibilityRole="header"
                  className="text-title2 font-bold text-default"
                >
                  {vm.uploaded
                    ? "Check every game before adding"
                    : vm.photo
                      ? "Where do these games belong?"
                      : "Add games from a scoresheet"}
                </AppText>
              )}
              {!ready && (
                <AppText className="text-body text-muted">
                  {vm.uploaded
                    ? "Compare names and scores with your photo. Nothing is recorded until you tap Add games."
                    : vm.photo
                      ? "Choose league or pickup so we can use the right players to help read your scores."
                      : "Take a photo of your sheet with written scores and we'll load the games from it. You'll get a chance to change anything that's incorrect and choose where it was played and if it's part of a league."}
                </AppText>
              )}
              {vm.photo != null && !vm.uploaded && (
                <ScoresheetPhoto key={vm.photo.uri} uri={vm.photo.uri} />
              )}
              {!vm.uploaded && (
                <>
                  <Button
                    title="Change photo"
                    variant="outline"
                    disabled={vm.busy}
                    onPress={openSource}
                  />
                  <AppText className="text-caption text-muted">
                    JPEG, PNG, or HEIC · Up to 10 MB
                  </AppText>
                </>
              )}
              {vm.photo && !vm.processing && !ready && (
                <View
                  testID="scoresheet-context"
                  onLayout={(event) => {
                    contextTop.current = event.nativeEvent.layout.y;
                  }}
                >
                  <ScoresheetContextFields
                    vm={vm}
                    validationIssue={validationIssue}
                    onFieldLayout={(field, y) => {
                      fieldOffsets.current[field] = y;
                    }}
                  />
                </View>
              )}
              {!vm.uploaded && vm.photo && vm.contextReady && (
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
                <View className="bg-surface p-6 rounded-card gap-3">
                  <AppText className="text-body font-semibold text-default">
                    Reading names and scores…
                  </AppText>
                  <AppText className="text-caption text-muted">
                    This may take a minute. You can switch apps and return to
                    this screen.
                  </AppText>
                </View>
              )}
              {ready && (
                <>
                  {vm.result?.clarification &&
                    !vm.result.clarification.includes(
                      "I couldn't match these player names:",
                    ) && (
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
                    leagueId={vm.leagueId || null}
                    onResolve={vm.resolve}
                    disabled={vm.busy}
                    onEdit={vm.editGame}
                    selectedIds={vm.selectedIds}
                    manualChoices={vm.manualChoices}
                    onEditingChange={vm.setEditorOpen}
                  />
                  <ScoresheetReviewDetails vm={vm} />
                  <ScoresheetCorrectionForm
                    value={vm.editPrompt}
                    onChange={vm.setEditPrompt}
                    disabled={vm.busy || vm.editorOpen}
                  />
                  <Button
                    title="Try another photo"
                    variant="ghost"
                    disabled={vm.busy}
                    onPress={replacePhoto}
                  />
                </>
              )}
            </>
          )}
        </ScrollView>
        <ScoresheetActionBar
          vm={vm}
          error={error}
          onReplace={replacePhoto}
          onRead={read}
        />
      </KeyboardAvoidingView>
      {chooser.sheet}
    </SafeAreaView>
  );
}
