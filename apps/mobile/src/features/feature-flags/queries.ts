import { queryOptions, useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { privateKeys, publicKeys } from "@/infrastructure/query/keys";
import type { FeaturePlatform } from "@beach-kings/api-client";

export const featureFlagKeys = {
  resolved: (userId: number | null, platform: FeaturePlatform) =>
    [
      ...(userId === null ? publicKeys.root : privateKeys.user(userId)),
      "feature-flags",
      platform,
    ] as const,
};

export const featureFlagQueries = {
  resolved: (
    userId: number | null,
    platform: FeaturePlatform,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: featureFlagKeys.resolved(userId, platform),
      queryFn: ({ signal }) => api.getFeatureFlags(platform, { signal }),
      enabled,
      staleTime: 0,
      refetchInterval: 30_000,
      refetchOnWindowFocus: "always" as const,
      retry: false,
    }),
};

export function useFeatureFlag(key: string) {
  const { user, isLoading } = useAuth();
  const platform: FeaturePlatform =
    Platform.OS === "ios"
      ? "ios"
      : Platform.OS === "android"
        ? "android"
        : "web";
  const query = useQuery(
    featureFlagQueries.resolved(user?.id ?? null, platform, !isLoading),
  );
  return {
    enabled: !isLoading && !query.isError && query.data?.[key] === true,
    isLoading: isLoading || query.isPending,
  };
}
