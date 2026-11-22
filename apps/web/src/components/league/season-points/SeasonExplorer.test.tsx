import React from "react";
import { vi, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SeasonExplorer from "./SeasonExplorer";
import type { SeasonPointsData } from "@beach-kings/shared";
vi.mock("./ProgressChart", () => ({
  default: ({ players, onSelect }: any) => (
    <div data-testid="curves">
      {players.map((p: any) => (
        <button key={p.id} onClick={() => onSelect(p.id)}>
          {p.name} curve
        </button>
      ))}
    </div>
  ),
}));
const data: SeasonPointsData = {
  league: "Test league",
  season: "Spring",
  startDate: "2026-01-01",
  endDate: null,
  baseline: 0,
  scoringSystem: "points_system",
  fetchedAt: "2026-01-05T00:00:00Z",
  sessions: [],
  players: [
    {
      id: "a",
      name: "Test Alpha",
      rank: 1,
      games: 8,
      wins: 5,
      points: 18,
      complete: true,
      history: [],
    },
    {
      id: "b",
      name: "Test Beta",
      rank: 2,
      games: 4,
      wins: 3,
      points: 10,
      complete: true,
      history: [],
    },
  ],
};
it("supports minimum GP only, preserves multiselect, and selects a curve for the heading", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  render(<SeasonExplorer season={data} />);
  expect(screen.queryByText("Points exploration")).toBeNull();
  expect(screen.queryByText("THE DETAILS")).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getAllByLabelText("Test Alpha avatar")).toHaveLength(2);
  expect(screen.getByRole("group", { name: "Chart timeline" })).toHaveClass(
    "segmented-control",
  );
  expect(screen.queryByLabelText("Maximum games played")).toBeNull();
  fireEvent.click(screen.getByLabelText("Plot Test Beta"));
  expect(screen.getByTestId("curves").children).toHaveLength(2);
  fireEvent.click(screen.getByText("Test Beta curve"));
  expect(screen.getByTestId("selected-player-name")).toHaveTextContent(
    "Test Beta",
  );
  fireEvent.change(screen.getByLabelText("Minimum games played"), {
    target: { value: "8" },
  });
  expect(screen.getByTestId("curves").children).toHaveLength(1);
  fireEvent.click(screen.getByLabelText("Reset games played filter"));
  expect(screen.getByTestId("curves").children).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Minimum games played"), {
    target: { value: "100" },
  });
  expect(screen.getByText("No players in this GP range")).toBeInTheDocument();
});

it("toggles all matching players while preserving selections outside filters", () => {
  render(<SeasonExplorer season={data} />);
  const toggle = screen.getByRole("checkbox", { name: "Select all players" });
  expect(toggle).toBePartiallyChecked();
  fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  expect(screen.getByTestId("curves").children).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Find a player"), {
    target: { value: "Beta" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select all matching players" }),
  );
  expect(screen.getByTestId("curves").children).toHaveLength(1);
  expect(screen.getByLabelText("Plot Test Beta")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("Clear player search"));
  expect(toggle).toBePartiallyChecked();
  fireEvent.change(screen.getByLabelText("Minimum games played"), {
    target: { value: "8" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select all matching players" }),
  );
  expect(screen.getByTestId("curves").children).toHaveLength(0);
  fireEvent.click(screen.getByLabelText("Reset games played filter"));
  fireEvent.click(toggle);
  expect(screen.getByTestId("curves").children).toHaveLength(2);
  fireEvent.click(toggle);
  expect(screen.getByTestId("curves").children).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Find a player"), {
    target: { value: "Nobody" },
  });
  expect(
    screen.getByRole("checkbox", { name: "Select all matching players" }),
  ).toBeDisabled();
});
