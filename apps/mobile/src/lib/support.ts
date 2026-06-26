/**
 * Support contact helpers.
 *
 * Self-service phone-number *changes* are out of scope — users are routed to
 * a pre-filled email draft instead. See `AddPhoneScreen` for the one-time
 * add-phone OTP flow used when no phone is set yet.
 */

export const SUPPORT_EMAIL = 'beachleaguevb+support@gmail.com';

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
