import { Suspense } from "react";
import KobLive from "../../../src/components/kob/KobLive";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return {
    title: `Tournament ${code} | Beach Kings`,
    description: "Live King/Queen of the Beach tournament",
  };
}

export default async function KobLivePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>Loading tournament...</div>}>
      <KobLive code={code} />
    </Suspense>
  );
}
