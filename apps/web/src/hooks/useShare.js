/**
 * Centralized Share System
 * ========================
 * Single source of truth for all invite-link sharing in the app.
 *
 * Architecture:
 *   useShare() hook  →  navigator.share() (native OS sheet on mobile)
 *                    →  ShareFallbackModal (Copy Link / WhatsApp / SMS / Email)
 *
 * On mobile devices with navigator.share() support, the native OS share sheet
 * is used. On desktop, the in-app fallback modal is always preferred since the
 * native desktop share sheet is often invisible or confusing.
 *
 * Consumers (all call shareInvite({ name, url })):
 *   - PendingInvitesTab     — share button per placeholder card
 *   - PlaceholderCreateModal — "Share Invite" after creation
 *   - AddMatchModal          — auto-fires for first placeholder after submit
 *   - PlayerDetails          — "Invite to claim profile" (pre-fetches URL)
 *
 * Important: shareInvite must be called synchronously from a click handler
 * (or very soon after) to preserve the browser's transient user activation
 * for navigator.share(). Do NOT await async calls before shareInvite.
 */

import { useCallback } from 'react';
import { useModal, MODAL_TYPES } from '../contexts/ModalContext';

/** Shared invite title used across native share and fallback modal. */
export const SHARE_TITLE = 'Beach League Invite';

/** Build the share text for a given player name. */
export const getShareText = (name) => `${name} — claim your matches on Beach League`;

/**
 * Detect if the device is mobile/touch-based.
 * Only use navigator.share() on mobile — desktop share sheets are poor UX.
 */
function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0;
}

/**
 * Hook providing a single `shareInvite({ name, url })` function.
 *
 * Mobile: navigator.share() → native OS share sheet.
 * Desktop: ShareFallbackModal via ModalContext (Copy Link / WhatsApp / SMS / Email).
 *
 * @returns {{ shareInvite: (opts: { name: string, url: string }) => Promise<void> }}
 */
export default function useShare() {
  const { openModal } = useModal();

  const shareInvite = useCallback(async ({ name, url }) => {
    const text = getShareText(name);

    // Use native share on mobile only
    if (isMobileDevice() && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: SHARE_TITLE, text, url });
        return;
      } catch (err) {
        // User cancelled — do nothing
        if (err.name === 'AbortError') return;
        // Other error (e.g. expired activation) — fall through to modal
      }
    }

    // Fallback: open the share modal (always on desktop, or on mobile error)
    openModal(MODAL_TYPES.SHARE_FALLBACK, { name, url, text });
  }, [openModal]);

  return { shareInvite };
}
