import { Suspense } from "react";
import KobCreate from "../../../src/components/kob/KobCreate";
import RouteLoadingShell from "../../../src/components/ui/RouteLoadingShell";

export const metadata = {
  title: "Create Tournament | Beach League",
  description: "Create a King or Queen of the Beach tournament",
};

export default function KobCreatePage() {
  return (
    <Suspense fallback={<RouteLoadingShell />}>
      <KobCreate />
    </Suspense>
  );
}
