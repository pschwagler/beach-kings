import * as StoreReview from "expo-store-review";
import { Alert, Linking } from "react-native";

const ALERT_TITLE = "Rate Beach League";
const OPEN_FAILURE_MESSAGE =
  "We couldn't open the store listing. Please try again, or contact Support from Settings if the problem continues.";
const UNAVAILABLE_MESSAGE =
  "Ratings aren't available on this device yet. Please try again later or contact Support from Settings.";

function showRatingAlert(message: string): void {
  Alert.alert(ALERT_TITLE, message);
}

/**
 * Uses the native review prompt only when the runtime reports it available.
 * TestFlight reports native review as unavailable, so it opens the configured
 * product URL instead.
 */
export async function requestAppRating(): Promise<void> {
  let nativeReviewAvailable = false;

  try {
    nativeReviewAvailable =
      (await StoreReview.hasAction()) && (await StoreReview.isAvailableAsync());
  } catch {
    // A configured product URL can still recover from a capability-check error.
  }

  if (nativeReviewAvailable) {
    try {
      await StoreReview.requestReview();
      return;
    } catch {
      // Fall through to the store listing when the native prompt fails.
    }
  }

  let url: string | null;
  try {
    url = StoreReview.storeUrl();
  } catch {
    showRatingAlert(OPEN_FAILURE_MESSAGE);
    return;
  }

  if (url == null) {
    showRatingAlert(UNAVAILABLE_MESSAGE);
    return;
  }

  try {
    await Linking.openURL(url);
  } catch {
    showRatingAlert(OPEN_FAILURE_MESSAGE);
  }
}
