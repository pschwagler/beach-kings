import React from "react";
import { ScrollView } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import ScoresheetScreen from "@/components/screens/Scoresheets/ScoresheetScreen";
import { scoresheetInputIssue } from "@/components/screens/Scoresheets/scoresheetValidation";

jest.mock("@/components/screens/Scoresheets/useScoresheetScreen", () => ({
  useScoresheetScreen: () => mockVm,
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ canGoBack: () => true, back: jest.fn() }),
  useNavigation: () => ({ dispatch: jest.fn() }),
}));
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: jest.fn(),
}));
jest.mock("@/hooks/useKeyboard", () => ({
  __esModule: true,
  default: () => ({ isVisible: false }),
}));
jest.mock("@/theme/usePaletteColors", () => ({ usePaletteColors: () => ({}) }));
jest.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));
jest.mock("@/utils/haptics", () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));
jest.mock("@/components/screens/Scoresheets/useScoresheetPhotoSource", () => ({
  useScoresheetPhotoSource: () => ({ open: jest.fn(), sheet: null }),
}));
jest.mock("@/components/ui/TopNav", () => () => null);
jest.mock("@/components/screens/Scoresheets/ScoresheetPhoto", () => () => null);
jest.mock(
  "@/components/screens/Scoresheets/ScoresheetReview",
  () => () => null,
);
jest.mock(
  "@/components/screens/Scoresheets/ScoresheetReviewDetails",
  () => () => null,
);
jest.mock("@/components/screens/Sessions/SessionCourtPicker", () => () => null);
jest.mock("@/components/screens/Sessions/SessionDateField", () => () => null);
jest.mock(
  "@/components/screens/Sessions/SessionSeasonSelector",
  () => () => null,
);

const upload = jest.fn();
let mockVm: Record<string, any>;
beforeEach(() => {
  jest.clearAllMocks();
  mockVm = {
    photo: { uri: "file:///sheet.jpg" },
    gameType: null,
    leagueId: 0,
    date: "2026-11-14",
    contextReady: false,
    jobQuery: {},
    seasons: { data: [], isSuccess: true },
    leagues: { data: [{ id: 1, name: "Test league" }], isSuccess: true },
    chooseGameType: jest.fn(),
    chooseLeague: jest.fn(),
    choosePhoto: jest.fn(),
    upload,
    uploaded: false,
    busy: false,
  };
});

test.each([
  [null, "scoresheet-game-type-field", "Choose League or Pickup."],
  [
    "league",
    "scoresheet-league-field",
    "Choose the league these games belong to.",
  ],
])(
  "read scrolls to the first invalid field for %s games",
  (gameType, field, message) => {
    mockVm.gameType = gameType;
    const scrollTo = jest
      .spyOn(ScrollView.prototype, "scrollTo")
      .mockImplementation(() => {});
    render(<ScoresheetScreen leagueId={null} />);
    fireEvent(screen.getByTestId("scoresheet-context"), "layout", {
      nativeEvent: { layout: { y: 600 } },
    });
    fireEvent(screen.getByTestId(field), "layout", {
      nativeEvent: { layout: { y: 40 } },
    });
    expect(screen.getByTestId("read-scoresheet")).toBeEnabled();
    fireEvent.press(screen.getByTestId("read-scoresheet"));
    expect(scrollTo).toHaveBeenCalledWith({ y: 624, animated: true });
    expect(screen.getByText(message)).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  },
);

test("read uploads after all required fields are filled", () => {
  mockVm.gameType = "pickup";
  mockVm.contextReady = true;
  render(<ScoresheetScreen leagueId={null} />);
  fireEvent.press(screen.getByTestId("read-scoresheet"));
  expect(upload).toHaveBeenCalledTimes(1);
});

test("missing photo and invalid calendar dates identify their fields", () => {
  expect(scoresheetInputIssue({ ...mockVm, photo: null } as any)?.field).toBe(
    "photo",
  );
  expect(
    scoresheetInputIssue({
      ...mockVm,
      gameType: "pickup",
      date: "2026-02-30",
    } as any)?.field,
  ).toBe("date");
});
