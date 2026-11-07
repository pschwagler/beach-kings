import React from "react";
import { useLocalSearchParams } from "expo-router";
import ScoresheetScreen from "@/components/screens/Scoresheets/ScoresheetScreen";

export default function ScanScoresheetRoute(): React.ReactNode {
  const { leagueId } = useLocalSearchParams<{ leagueId?: string }>();
  const id = Number(leagueId);
  return (
    <ScoresheetScreen leagueId={Number.isInteger(id) && id > 0 ? id : null} />
  );
}
