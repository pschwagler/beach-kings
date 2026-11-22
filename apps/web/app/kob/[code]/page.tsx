import FeatureGate from "../../../src/components/ui/FeatureGate";
import { Suspense } from "react";
import KobLive from "../../../src/components/kob/KobLive";
import RouteLoadingShell from "../../../src/components/ui/RouteLoadingShell";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return {
    title: `Tournament ${code} | Beach League`,
    description: "Live King/Queen of the Beach tournament",
  };
}

export default async function KobLivePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={<RouteLoadingShell />}>
      <FeatureGate flags={["kob_tournaments"]}><KobLive code={code} /></FeatureGate>
    </Suspense>
  );
}
