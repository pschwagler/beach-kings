import React from "react";
import { render, screen } from "@testing-library/react-native";
import Route from "../../../app/(stack)/scan-scoresheet";

let mockFlag = { enabled: true, isLoading: false };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ leagueId: "10" }),
}));
jest.mock("@/features/feature-flags/queries", () => ({
  useFeatureFlag: () => mockFlag,
}));
jest.mock("@/components/screens/Scoresheets/ScoresheetScreen", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: () => <Text testID="scanner">Scanner</Text>,
  };
});
jest.mock("@/components/screens/ComingSoon", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: () => <Text testID="unavailable">Unavailable</Text>,
  };
});

test("allows direct scan routes when the flag is on", () => {
  mockFlag = { enabled: true, isLoading: false };
  render(<Route />);
  expect(screen.getByTestId("scanner")).toBeTruthy();
});
test.each([
  { enabled: false, isLoading: false },
  { enabled: false, isLoading: true },
])("blocks direct routes while disabled or loading: %o", (flag) => {
  mockFlag = flag;
  render(<Route />);
  expect(screen.queryByTestId("scanner")).toBeNull();
  expect(screen.getByTestId("unavailable")).toBeTruthy();
});
