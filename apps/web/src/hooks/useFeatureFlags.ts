"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getFeatureFlags } from "../services/endpoints/featureFlags";

export function useFeatureFlags() {
  const { user, isInitializing } = useAuth();
  const identity = user?.id ?? null;
  const [result, setResult] = useState<{
    identity: number | null;
    flags: Record<string, boolean>;
  } | null>(null);
  useEffect(() => {
    if (isInitializing) return;
    const controller = new AbortController();
    let latest = 0;
    async function refresh() {
      const attempt = ++latest;
      try {
        const flags = await getFeatureFlags(controller.signal);
        if (!controller.signal.aborted && latest === attempt)
          setResult({ identity, flags });
      } catch {
        if (!controller.signal.aborted && latest === attempt)
          setResult({ identity, flags: {} });
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [identity, isInitializing]);
  const ready = !isInitializing && result?.identity === identity;
  return { flags: ready ? result.flags : {}, isLoading: !ready };
}
