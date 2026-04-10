import { Suspense } from "react";
import KobCreate from "../../../src/components/kob/KobCreate";
import PageSkeleton from "../../../src/components/ui/PageSkeleton";

export const metadata = {
  title: "Create Tournament | Beach League",
  description: "Create a King or Queen of the Beach tournament",
};

export default function KobCreatePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <KobCreate />
    </Suspense>
  );
}
