import React from "react";
import { expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SeasonPointsData } from "@beach-kings/shared";
import SeasonPointsPage from "./SeasonPointsPage";

const { getPoints, auth } = vi.hoisted(() => ({
  getPoints: vi.fn(),
  auth: { isAuthenticated: true, isInitializing: false, user: { id: 1 } },
}));
vi.mock("../../../services/endpoints/seasonPoints", () => ({
  getSeasonPoints: getPoints,
}));
vi.mock("../../../contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../../contexts/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: vi.fn() }),
}));
vi.mock("../../layout/NavBar", () => ({
  default: () => <nav aria-label="Main navigation" />,
}));
vi.mock("./SeasonExplorer", () => ({
  default: ({ season }: { season: SeasonPointsData }) => (
    <div>{season.season}</div>
  ),
}));

beforeEach(() => {
  getPoints.mockReset();
});

it("keeps the Navbar and permits retry after a failed request", async () => {
  getPoints
    .mockRejectedValueOnce({ response: { status: 403 } })
    .mockResolvedValueOnce({ players: [] });
  render(<SeasonPointsPage leagueId={1} seasonId={4} />);
  expect(screen.getByRole("navigation")).toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "You do not have access",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading season points");
  expect(
    await screen.findByText("No official results for this season yet."),
  ).toBeInTheDocument();
});

it("cancels old requests and ignores late results when switching seasons", async () => {
  let resolveOld!: (data: unknown) => void;
  getPoints.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  getPoints.mockResolvedValueOnce({ season: "New season", players: [{}] });
  const { rerender } = render(<SeasonPointsPage leagueId={1} seasonId={4} />);
  const signal = getPoints.mock.calls[0][2] as AbortSignal;
  rerender(<SeasonPointsPage leagueId={1} seasonId={5} />);
  expect(signal.aborted).toBe(true);
  expect(await screen.findByText("New season")).toBeInTheDocument();
  resolveOld({ season: "Old season", players: [{}] });
  await waitFor(() => expect(screen.queryByText("Old season")).toBeNull());
});

it("does not request invalid season IDs", () => {
  render(<SeasonPointsPage leagueId={1} seasonId={NaN} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Season not found.");
  expect(getPoints).not.toHaveBeenCalled();
});
