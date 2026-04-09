import { Suspense } from "react";
import KobSetup from "../../../../src/components/kob/KobSetup";

export const metadata = {
  title: "Setup Tournament | Beach League",
  description: "Set up your King/Queen of the Beach tournament",
};

export default async function KobManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>Loading...</div>}>
      <KobSetup tournamentId={parseInt(id, 10)} />
    </Suspense>
  );
}
