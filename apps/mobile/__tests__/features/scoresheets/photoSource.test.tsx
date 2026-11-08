import React from "react";
import { ActionSheetIOS, Button, Platform } from "react-native";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { useScoresheetPhotoSource } from "@/components/screens/Scoresheets/useScoresheetPhotoSource";
import ScanScoresheetAction from "@/components/screens/Scoresheets/ScanScoresheetAction";

jest.mock("@/theme/usePaletteColors", () => ({ usePaletteColors: () => ({}) }));
jest.mock("@/components/ui/BottomSheet", () => {
  const React = require("react"),
    { View } = require("react-native");
  return {
    __esModule: true,
    default: ({ visible, children }: any) =>
      visible ? <View>{children}</View> : null,
  };
});
const select = jest.fn(),
  cancel = jest.fn();
let callback: (index: number) => void;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest
    .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
    .mockImplementation((_options, onSelect) => {
      callback = onSelect;
    });
});
afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
  jest.restoreAllMocks();
});
test.each([
  [0, "camera"],
  [1, "library"],
] as const)("native source %s delivers %s after dismissal", (index, source) => {
  const { result } = renderHook(() => useScoresheetPhotoSource(select, cancel));
  act(() => result.current.open({ anchor: 123 }));
  expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledWith(
    expect.objectContaining({
      anchor: 123,
      options: ["Take photo", "Choose from photos", "Cancel"],
      cancelButtonIndex: 2,
    }),
    expect.any(Function),
  );
  act(() => callback(index));
  expect(select).not.toHaveBeenCalled();
  act(() => jest.runOnlyPendingTimers());
  expect(select).toHaveBeenCalledTimes(1);
  expect(select).toHaveBeenCalledWith(source);
  expect(cancel).not.toHaveBeenCalled();
});
test("cancel does not choose a source; double taps do not stack sheets", () => {
  const { result } = renderHook(() => useScoresheetPhotoSource(select, cancel));
  act(() => {
    result.current.open();
    result.current.open();
  });
  expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledTimes(1);
  act(() => {
    callback(2);
    callback(2);
  });
  act(() => jest.runOnlyPendingTimers());
  expect(select).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(1);
  act(() => result.current.open());
  expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledTimes(2);
});
test("the scan entry waits for a choice before navigating", () => {
  render(<ScanScoresheetAction onPress={select} />);
  fireEvent.press(screen.getByRole("button", { name: "Scan scoresheet" }));
  expect(select).not.toHaveBeenCalled();
  act(() => callback(1));
  act(() => jest.runOnlyPendingTimers());
  expect(select).toHaveBeenCalledWith("library");
});
test("Android offers the same choices in a bottom sheet", () => {
  jest.replaceProperty(Platform, "OS", "android");
  function Harness() {
    const source = useScoresheetPhotoSource(select, cancel);
    return (
      <>
        <Button title="Scan" onPress={() => source.open()} />
        {source.sheet}
      </>
    );
  }
  render(<Harness />);
  fireEvent.press(screen.getByRole("button", { name: /scan/i }));
  expect(ActionSheetIOS.showActionSheetWithOptions).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Choose from photos"));
  act(() => jest.runOnlyPendingTimers());
  expect(select).toHaveBeenCalledWith("library");
});
