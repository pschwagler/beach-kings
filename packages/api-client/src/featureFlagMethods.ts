import type { AxiosInstance } from "axios";

export type FeaturePlatform = "web" | "ios" | "android";
export type ResolvedFeatureFlags = Record<string, boolean>;

export function createFeatureFlagMethods(api: AxiosInstance) {
  return {
    async getFeatureFlags(
      platform: FeaturePlatform,
      options?: { signal?: AbortSignal },
    ): Promise<ResolvedFeatureFlags> {
      return (
        await api.get("/api/feature-flags", {
          params: { platform },
          signal: options?.signal,
        })
      ).data;
    },
  };
}
