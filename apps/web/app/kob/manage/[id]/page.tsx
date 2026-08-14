import { Suspense } from "react";
import KobSetup from "../../../../src/components/kob/KobSetup";
import RouteLoadingShell from "../../../../src/components/ui/RouteLoadingShell";

export const metadata = {
  title: "Setup Tournament | Beach League",
  description: "Set up your King/Queen of the Beach tournament",
};

export default async function KobManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<RouteLoadingShell />}>
      <KobSetup tournamentId={parseInt(id, 10)} />
    </Suspense>
  );
}
