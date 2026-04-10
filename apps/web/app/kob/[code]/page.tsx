import { Suspense } from "react";
import KobLive from "../../../src/components/kob/KobLive";
import PageSkeleton from "../../../src/components/ui/PageSkeleton";

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
    <Suspense fallback={<PageSkeleton />}>
      <KobLive code={code} />
    </Suspense>
  );
}
