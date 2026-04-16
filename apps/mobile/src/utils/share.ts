/**
 * Native Share sheet helper.
 *
 * Wraps React Native's `Share` API so call sites don't need to handle the
 * dismissed/unavailable cases themselves.
 */
import { Share } from 'react-native';

/**
 * Opens the platform native share sheet for a URL.
 *
 * Silently resolves if the user dismisses the share sheet or if sharing
 * is unavailable on the current platform.
 *
 * @param url - The URL to share.
 * @param title - Optional sheet / message title (shown on Android and some iOS contexts).
 */
export async function shareLink(url: string, title?: string): Promise<void> {
  try {
    await Share.share(
      {
        url,
        message: url,
        title,
      },
      {
        dialogTitle: title,
      },
    );
  } catch (err) {
    // Re-throw unexpected errors; ignore user-dismissed cases.
    if (err instanceof Error && err.message === 'Share was cancelled') return;
    if (err instanceof Error && err.message.includes('dismissed')) return;
    throw err;
  }
}
