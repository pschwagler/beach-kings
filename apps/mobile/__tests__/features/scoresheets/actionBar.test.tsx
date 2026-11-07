import React from "react";
import { render, screen } from "@testing-library/react-native";
import ScoresheetActionBar from "@/components/screens/Scoresheets/ScoresheetActionBar";
import type { useScoresheetScreen } from "@/components/screens/Scoresheets/useScoresheetScreen";

jest.mock("@/theme/usePaletteColors", () => ({ usePaletteColors: () => ({}) }));
jest.mock("@/utils/haptics", () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));
const base = {
  leagueId: 0,
  photo: null,
  uploaded: false,
  confirmed: false,
  processing: false,
  busy: false,
  uploading: false,
  jobQuery: {},
  seasons: { isSuccess: false },
};
function renderBar(overrides: Record<string, unknown> = {}) {
  render(
    <ScoresheetActionBar
      vm={{ ...base, ...overrides } as ReturnType<typeof useScoresheetScreen>}
      error={null}
      onReplace={jest.fn()}
    />,
  );
}
test("explains why reading is disabled until a photo is chosen", () => {
  renderBar();
  expect(
    screen.getByText("Choose a photo above to read its scores."),
  ).toBeTruthy();
  expect(screen.getByTestId("read-scoresheet")).toBeDisabled();
});
test.each([0, 10])(
  "photo is enough to enable reading for league %s",
  (leagueId) => {
    renderBar({ leagueId, photo: { uri: "file:///photo.jpg" } });
    expect(screen.getByTestId("read-scoresheet")).toBeEnabled();
  },
);
test("pickup confirmation never waits for a league's seasons", () => {
  renderBar({
    uploaded: true,
    jobQuery: { data: { status: "COMPLETED" } },
    matches: [{}],
    issue: null,
  });
  expect(screen.getByTestId("confirm-scoresheet")).toBeEnabled();
});
