/**
 * Support contact helpers.
 *
 * Self-service phone-number *changes* are out of scope — users are routed to
 * a pre-filled email draft instead. See `AddPhoneScreen` for the one-time
 * add-phone OTP flow used when no phone is set yet.
 */

import { Alert } from 'react-native';
import { tryOpenExternalUrl } from './externalUrls';

export const SUPPORT_EMAIL = 'beachleaguevb+support@gmail.com';

const SUPPORT_EMAIL_FALLBACK_TITLE = 'Email app unavailable';
const SUPPORT_EMAIL_FALLBACK_MESSAGE =
  `We couldn't open an email app. You can contact us at ${SUPPORT_EMAIL}.`;

/**
 * Build a `mailto:` URL that opens the user's mail client with a pre-filled
 * subject line for a phone-change request.
 */
export function supportMailtoPhoneChange(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Change phone number')}`;
}

/**
 * Build a general-purpose `mailto:` URL for support enquiries.
 */
export function supportMailtoGeneral(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Beach League Support')}`;
}

/**
 * Open a pre-built support email link without leaking platform failures to the
 * UI. The address in the fallback message gives users another way to continue
 * when no email app is installed or configured.
 */
export async function openSupportMailto(url: string): Promise<boolean> {
  if (!(await tryOpenExternalUrl(url, ['mailto:']))) {
    Alert.alert(SUPPORT_EMAIL_FALLBACK_TITLE, SUPPORT_EMAIL_FALLBACK_MESSAGE);
    return false;
  }

  return true;
}
