import api from "../api-client";

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  rollout_percent: number;
  user_ids: number[];
  platforms: ("web" | "ios" | "android")[];
  revision: number;
}
export interface FlagChange {
  id: number;
  actor_user_id: number | null;
  reason: string;
  occurred_at: string;
  before: FeatureFlag | null;
  after: FeatureFlag;
}
export const getFeatureFlags = async (
  signal?: AbortSignal,
): Promise<Record<string, boolean>> =>
  (await api.get("/api/feature-flags", { params: { platform: "web" }, signal }))
    .data;
export const getAdminFeatureFlags = async (): Promise<FeatureFlag[]> =>
  (await api.get("/api/admin-view/feature-flags")).data;
export const getFlagHistory = async (key: string): Promise<FlagChange[]> =>
  (await api.get(`/api/admin-view/feature-flags/${key}/history`)).data;
export const saveFeatureFlag = async (
  flag: FeatureFlag,
  reason: string,
  create = false,
): Promise<FeatureFlag> => {
  const { key, revision, ...values } = flag;
  return (
    await (create
      ? api.post("/api/admin-view/feature-flags", { ...values, key, reason })
      : api.put(`/api/admin-view/feature-flags/${key}`, {
          ...values,
          revision,
          reason,
        }))
  ).data;
};
