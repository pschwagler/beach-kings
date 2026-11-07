"use client";
import type { ReactNode } from "react";
import { useFeatureFlags } from "../../hooks/useFeatureFlags";
import RouteLoadingShell from "./RouteLoadingShell";

export default function FeatureGate({
  flags: required,
  children,
}: {
  flags: string[];
  children: ReactNode;
}) {
  const { flags, isLoading } = useFeatureFlags();
  if (isLoading) return <RouteLoadingShell />;
  if (!required.every((key) => flags[key] === true)) {
    return (
      <RouteLoadingShell>
        <main className="container" role="status">
          <h1>Feature unavailable</h1>
          <p>This feature is not currently available for your account.</p>
          <a href="/home">Return home</a>
        </main>
      </RouteLoadingShell>
    );
  }
  return children;
}
