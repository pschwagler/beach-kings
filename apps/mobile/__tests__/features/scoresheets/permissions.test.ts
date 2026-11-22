import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  pickScoresheetPhoto,
  ScoresheetCameraAccessError,
} from "@/components/screens/Scoresheets/pickScoresheetPhoto";

jest.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const photo = {
    canceled: false,
    assets: [{ uri: "file:///sheet.jpg", mimeType: "image/jpeg" }],
  };
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(photo as never);
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue(photo as never);
});
afterEach(() => jest.restoreAllMocks());

test("first camera use requests permission before opening the camera", async () => {
  jest
    .mocked(ImagePicker.getCameraPermissionsAsync)
    .mockResolvedValue({ granted: false, canAskAgain: true } as never);
  jest
    .mocked(ImagePicker.requestCameraPermissionsAsync)
    .mockImplementation(async () => {
      expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
      return { granted: true } as never;
    });
  expect((await pickScoresheetPhoto(true))?.uri).toBe("file:///sheet.jpg");
  expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
});

test("already granted access opens the camera without requesting again", async () => {
  jest
    .mocked(ImagePicker.getCameraPermissionsAsync)
    .mockResolvedValue({ granted: true } as never);
  await pickScoresheetPhoto(true);
  expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
  "denial keeps camera closed and offers Settings (can ask again: %s)",
  async (canAskAgain) => {
    const denied = { granted: false, canAskAgain };
    jest
      .mocked(ImagePicker.getCameraPermissionsAsync)
      .mockResolvedValue(denied as never);
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValue(denied as never);
    await expect(pickScoresheetPhoto(true)).rejects.toBeInstanceOf(
      ScoresheetCameraAccessError,
    );
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(
      canAskAgain ? 1 : 0,
    );
    const buttons = jest.mocked(Alert.alert).mock.calls[0]?.[2];
    const settings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
    buttons?.find((button) => button.text === "Open Settings")?.onPress?.();
    expect(settings).toHaveBeenCalledTimes(1);
  },
);

test("photo library selection never requests camera or full-library access", async () => {
  await pickScoresheetPhoto(false);
  expect(ImagePicker.getCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      preferredAssetRepresentationMode: "compatible",
    }),
  );
});
