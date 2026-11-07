import React from "react";
import { useLocalSearchParams } from "expo-router";
import { useFeatureFlag } from "@/features/feature-flags/queries";
import ComingSoon from "@/components/screens/ComingSoon";
import ScoresheetScreen from "@/components/screens/Scoresheets/ScoresheetScreen";

export default function ScanScoresheetRoute(): React.ReactNode {
  const { leagueId } = useLocalSearchParams<{ leagueId?: string }>();
  const id = Number(leagueId);
  const flag = useFeatureFlag("scoresheet_parsing");
  if (flag.isLoading || !flag.enabled) {
    return (
      <ComingSoon
        title="Scan Scoresheet"
        description={
          flag.isLoading
            ? "Checking availability…"
            : "Scoresheet scanning is currently unavailable."
        }
      />
    );
  }
  return (
    <ScoresheetScreen leagueId={Number.isInteger(id) && id > 0 ? id : null} />
  );
}
