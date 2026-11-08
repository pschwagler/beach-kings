import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ScoresheetMatch } from "@beach-kings/api-client";
import ScoresheetReview from "@/components/screens/Scoresheets/ScoresheetReview";
jest.mock("@/theme/usePaletteColors", () => ({ usePaletteColors: () => ({}) }));
jest.mock("@/utils/haptics", () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));
jest.mock("@/components/ui/Input", () => {
  const React = require("react"),
    { TextInput } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => <TextInput {...props} />,
  };
});
jest.mock("@/components/screens/Scoresheets/ScoresheetPlayerPicker", () => {
  const React = require("react"),
    { Pressable, Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ rawName, onResolve }: any) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Select Ken Example"
        onPress={() => onResolve(rawName, 8, "Ken Example")}
      >
        <Text>Ken Example</Text>
      </Pressable>
    ),
  };
});
const match: ScoresheetMatch = {
  number: 1,
  players: [1, 2, 3, 4].map((id) => ({
    id,
    name: `Player ${id}`,
    rawName: `Player ${id}`,
  })),
  scores: [21, 19],
};
const base = {
  leagueId: null,
  manualChoices: [],
  selectedIds: [],
  disabled: false,
  onResolve: jest.fn(),
  onEdit: jest.fn(),
  onEditingChange: jest.fn(),
};
beforeEach(() => jest.clearAllMocks());
test("unmatched player selection is at the top and opens immediately", () => {
  render(
    <ScoresheetReview
      {...base}
      unresolved={["Ken"]}
      matches={[
        {
          ...match,
          players: [
            { id: null, name: "Ken", rawName: "Ken" },
            ...match.players.slice(1),
          ],
        },
      ]}
    />,
  );
  const buttons = screen.getAllByRole("button");
  expect(buttons[0].props.accessibilityLabel).toBe("Match player Ken");
  fireEvent.press(screen.getByRole("button", { name: "Select Ken Example" }));
  expect(base.onResolve).toHaveBeenCalledWith("Ken", 8, "Ken Example");
});
test("selected names show the full identity with a checkmark", () => {
  render(
    <ScoresheetReview
      {...base}
      manualChoices={[
        { raw_name: "Ken", player_id: 8, player_name: "Ken Example" },
      ]}
      selectedIds={[8]}
      unresolved={[]}
      matches={[
        {
          ...match,
          players: [
            { id: 8, name: "Ken Example", rawName: "Ken" },
            ...match.players.slice(1),
          ],
        },
      ]}
    />,
  );
  expect(screen.getByText("Ken → Ken Example ✓")).toBeTruthy();
  expect(screen.queryByText("Choose player ›")).toBeNull();
});
test("edit game saves reviewed scores locally and cancel discards changes", () => {
  render(<ScoresheetReview {...base} matches={[match]} unresolved={[]} />);
  fireEvent.press(screen.getByRole("button", { name: "Edit game 1" }));
  fireEvent.changeText(screen.getByTestId("scoresheet-game-1-score-2"), "17");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect(base.onEdit).toHaveBeenCalledWith({ ...match, scores: [21, 17] }, []);
  expect(base.onEditingChange).toHaveBeenLastCalledWith(false);
  fireEvent.press(screen.getByRole("button", { name: "Edit game 1" }));
  fireEvent.changeText(screen.getByTestId("scoresheet-game-1-score-2"), "18");
  fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(base.onEdit).toHaveBeenCalledTimes(1);
});
