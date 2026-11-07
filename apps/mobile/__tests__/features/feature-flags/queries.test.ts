import { QueryClient } from "@tanstack/react-query";
import {
  featureFlagKeys,
  featureFlagQueries,
} from "@/features/feature-flags/queries";
import { api } from "@/lib/api";

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 }, isLoading: false }),
}));
jest.mock("@/lib/api", () => ({ api: { getFeatureFlags: jest.fn() } }));

test("isolates accounts, signed-out responses, and platforms", () => {
  expect(featureFlagKeys.resolved(1, "ios")).toEqual([
    "private",
    1,
    "feature-flags",
    "ios",
  ]);
  expect(featureFlagKeys.resolved(1, "ios")).not.toEqual(
    featureFlagKeys.resolved(2, "ios"),
  );
  expect(featureFlagKeys.resolved(null, "ios")).toEqual([
    "public",
    "feature-flags",
    "ios",
  ]);
  expect(featureFlagKeys.resolved(1, "ios")).not.toEqual(
    featureFlagKeys.resolved(1, "android"),
  );
});

test("passes cancellation to shared API client and refreshes remote controls", async () => {
  jest.mocked(api.getFeatureFlags).mockResolvedValue({ tournaments: true });
  const options = featureFlagQueries.resolved(1, "ios");
  const signal = new AbortController().signal;
  await options.queryFn?.({ signal } as never);
  expect(api.getFeatureFlags).toHaveBeenCalledWith("ios", { signal });
  expect(options.refetchInterval).toBe(30_000);
  expect(options.refetchOnWindowFocus).toBe("always");
});

test("never substitutes another account cache value", async () => {
  const client = new QueryClient();
  client.setQueryData(featureFlagKeys.resolved(1, "ios"), {
    tournaments: true,
  });
  expect(
    client.getQueryData(featureFlagKeys.resolved(2, "ios")),
  ).toBeUndefined();
  expect(
    client.getQueryData(featureFlagKeys.resolved(null, "ios")),
  ).toBeUndefined();
  client.clear();
});
