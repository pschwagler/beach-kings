import { Suspense } from "react";
import KobCreate from "../../../src/components/kob/KobCreate";

export const metadata = {
  title: "Create Tournament | Beach League",
  description: "Create a King or Queen of the Beach tournament",
};

export default function KobCreatePage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>Loading...</div>}>
      <KobCreate />
    </Suspense>
  );
}
