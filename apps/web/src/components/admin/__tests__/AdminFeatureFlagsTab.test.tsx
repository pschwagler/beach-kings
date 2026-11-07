import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AdminFeatureFlagsTab from "../AdminFeatureFlagsTab";
import {
  getAdminFeatureFlags,
  getFlagHistory,
  saveFeatureFlag,
} from "../../../services/endpoints/featureFlags";

vi.mock("../../../services/endpoints/featureFlags", () => ({
  getAdminFeatureFlags: vi.fn(),
  getFlagHistory: vi.fn(),
  saveFeatureFlag: vi.fn(),
}));
const flag = {
  key: "tournaments",
  description: "Tournament access",
  enabled: true,
  rollout_percent: 100,
  user_ids: [],
  platforms: ["web" as const],
  revision: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAdminFeatureFlags).mockResolvedValue([flag]);
  vi.mocked(saveFeatureFlag).mockImplementation(async (value) => value);
});
it("saves selected user targeting with a reason and expected revision", async () => {
  render(<AdminFeatureFlagsTab />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Manage tournaments" }),
  );
  fireEvent.change(screen.getByLabelText("Rollout percentage"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByLabelText("Selected user IDs"), {
    target: { value: "12, 34" },
  });
  fireEvent.change(screen.getByLabelText("Reason for change"), {
    target: { value: "Private pilot" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save flag" }));
  await waitFor(() =>
    expect(saveFeatureFlag).toHaveBeenCalledWith(
      { ...flag, rollout_percent: 0, user_ids: [12, 34] },
      "Private pilot",
      false,
    ),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Saved tournaments",
  );
});
it("creates a disabled flag with explicit platform selection", async () => {
  render(<AdminFeatureFlagsTab />);
  await screen.findByRole("button", { name: "Manage tournaments" });
  fireEvent.click(screen.getByRole("button", { name: "New flag" }));
  fireEvent.change(screen.getByLabelText("Flag key"), {
    target: { value: "new_release" },
  });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Release pilot" },
  });
  fireEvent.change(screen.getByLabelText("Reason for change"), {
    target: { value: "Prepare release" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save flag" }));
  await waitFor(() =>
    expect(saveFeatureFlag).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "new_release",
        enabled: false,
        rollout_percent: 0,
      }),
      "Prepare release",
      true,
    ),
  );
});
it("keeps unsaved input after conflicts and displays change history", async () => {
  vi.mocked(saveFeatureFlag).mockRejectedValue({ response: { status: 409 } });
  vi.mocked(getFlagHistory).mockResolvedValue([
    {
      id: 1,
      actor_user_id: 9,
      reason: "Paused for investigation",
      occurred_at: "2026-11-07T12:00:00Z",
      before: flag,
      after: { ...flag, enabled: false },
    },
  ]);
  render(<AdminFeatureFlagsTab />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Manage tournaments" }),
  );
  fireEvent.change(screen.getByLabelText("Reason for change"), {
    target: { value: "My change" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save flag" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Cancel and reload",
  );
  expect(screen.getByLabelText("Reason for change")).toHaveValue("My change");
  fireEvent.click(screen.getByRole("button", { name: "View change history" }));
  expect(
    await screen.findByText("Paused for investigation"),
  ).toBeInTheDocument();
});
it("provides retry after a load failure", async () => {
  vi.mocked(getAdminFeatureFlags).mockRejectedValueOnce(new Error("offline"));
  render(<AdminFeatureFlagsTab />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  fireEvent.click(screen.getByRole("button", { name: "Reload flags" }));
  expect(
    await screen.findByRole("button", { name: "Manage tournaments" }),
  ).toBeInTheDocument();
});
