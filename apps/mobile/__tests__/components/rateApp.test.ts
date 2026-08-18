import { Alert, Linking } from "react-native";
import * as StoreReview from "expo-store-review";

jest.mock("expo-store-review", () => ({
  hasAction: jest.fn(),
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
  storeUrl: jest.fn(),
}));

import { requestAppRating } from "@/components/screens/Settings/rateApp";

const mockHasAction = jest.mocked(StoreReview.hasAction);
const mockIsAvailable = jest.mocked(StoreReview.isAvailableAsync);
const mockRequestReview = jest.mocked(StoreReview.requestReview);
const mockStoreUrl = jest.mocked(StoreReview.storeUrl);
const mockOpenURL = jest.spyOn(Linking, "openURL");
const mockAlert = jest.spyOn(Alert, "alert");

describe("requestAppRating", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasAction.mockResolvedValue(true);
    mockIsAvailable.mockResolvedValue(false);
    mockRequestReview.mockResolvedValue(undefined);
    mockStoreUrl.mockReturnValue("https://apps.apple.com/app/id6801891670");
    mockOpenURL.mockResolvedValue(true);
    mockAlert.mockImplementation(() => undefined);
  });

  it("preserves the native review prompt when it is available", async () => {
    mockIsAvailable.mockResolvedValue(true);

    await requestAppRating();

    expect(mockRequestReview).toHaveBeenCalledTimes(1);
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it("opens the configured store URL when native review is unavailable", async () => {
    await requestAppRating();

    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(mockOpenURL).toHaveBeenCalledWith(
      "https://apps.apple.com/app/id6801891670",
    );
  });

  it("falls back to the store URL when the native request fails", async () => {
    mockIsAvailable.mockResolvedValue(true);
    mockRequestReview.mockRejectedValue(new Error("native prompt failed"));

    await requestAppRating();

    expect(mockOpenURL).toHaveBeenCalledWith(
      "https://apps.apple.com/app/id6801891670",
    );
  });

  it("falls back to the configured URL when capability detection fails", async () => {
    mockHasAction.mockRejectedValue(new Error("capability check failed"));

    await expect(requestAppRating()).resolves.toBeUndefined();

    expect(mockRequestReview).not.toHaveBeenCalled();
    expect(mockOpenURL).toHaveBeenCalledWith(
      "https://apps.apple.com/app/id6801891670",
    );
  });

  it("shows useful retry and support copy when opening the URL fails", async () => {
    mockOpenURL.mockRejectedValue(new Error("cannot open"));

    await requestAppRating();

    expect(mockAlert).toHaveBeenCalledWith(
      "Rate Beach League",
      expect.stringMatching(/try again.*support/i),
    );
  });

  it("handles a missing platform URL without trying to open one", async () => {
    mockHasAction.mockResolvedValue(false);
    mockStoreUrl.mockReturnValue(null);

    await requestAppRating();

    expect(mockOpenURL).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(
      "Rate Beach League",
      expect.stringMatching(/try again.*support/i),
    );
  });

  it("handles a URL-resolution exception with useful copy without rejecting", async () => {
    mockHasAction.mockResolvedValue(false);
    mockStoreUrl.mockImplementation(() => {
      throw new Error("config unavailable");
    });

    await expect(requestAppRating()).resolves.toBeUndefined();

    expect(mockOpenURL).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith(
      "Rate Beach League",
      expect.stringMatching(/try again.*support/i),
    );
  });
});
