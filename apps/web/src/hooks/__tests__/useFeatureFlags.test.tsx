import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFeatureFlags } from "../useFeatureFlags";
import { getFeatureFlags } from "../../services/endpoints/featureFlags";

let user: { id: number } | null = { id: 1 };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user, isInitializing: false }),
}));
vi.mock("../../services/endpoints/featureFlags", () => ({
  getFeatureFlags: vi.fn(),
}));
beforeEach(() => {
  user = { id: 1 };
  vi.resetAllMocks();
});
afterEach(() => vi.useRealTimers());

it("clears access immediately on account switch and ignores old requests", async () => {
  let resolveOld: (value: Record<string, boolean>) => void;
  vi.mocked(getFeatureFlags).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  vi.mocked(getFeatureFlags).mockResolvedValueOnce({ tournaments: false });
  const { result, rerender } = renderHook(() => useFeatureFlags());
  user = { id: 2 };
  rerender();
  expect(result.current.flags).toEqual({});
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => {
    resolveOld!({ tournaments: true });
  });
  expect(result.current.flags.tournaments).toBe(false);
});
it("refreshes on focus and fails closed on network errors", async () => {
  vi.mocked(getFeatureFlags).mockResolvedValueOnce({ tournaments: true });
  const { result } = renderHook(() => useFeatureFlags());
  await waitFor(() => expect(result.current.flags.tournaments).toBe(true));
  vi.mocked(getFeatureFlags).mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => expect(result.current.flags).toEqual({}));
  expect(result.current.isLoading).toBe(false);
});
it("refreshes while open and cancels requests on unmount", async () => {
  vi.useFakeTimers();
  vi.mocked(getFeatureFlags).mockResolvedValue({ tournaments: true });
  const { result, unmount } = renderHook(() => useFeatureFlags());
  await act(async () => {});
  expect(result.current.flags.tournaments).toBe(true);
  await act(async () => {
    vi.advanceTimersByTime(30_000);
  });
  expect(getFeatureFlags).toHaveBeenCalledTimes(2);
  const signal = vi.mocked(getFeatureFlags).mock.calls[0][0];
  unmount();
  expect(signal?.aborted).toBe(true);
});
