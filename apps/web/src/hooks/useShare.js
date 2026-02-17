/**
 * Centralized Share System
 * ========================
 * Single source of truth for all invite-link sharing in the app.
 *
 * Architecture:
 *   useShare() hook  →  navigator.share() (native OS sheet, 95%+ of users)
 *                    →  ShareFallbackModal (Copy Link / WhatsApp / SMS / Email)
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
 * Hook providing a single `shareInvite({ name, url })` function.
 *
 * Primary path: navigator.share() → native OS share sheet.
 * Fallback: opens ShareFallbackModal via ModalContext (SHARE_FALLBACK).
 *
 * @returns {{ shareInvite: (opts: { name: string, url: string }) => Promise<void> }}
 */
export default function useShare() {
  const { openModal } = useModal();

  const shareInvite = useCallback(async ({ name, url }) => {
    const text = getShareText(name);

    // Try native share first
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: SHARE_TITLE, text, url });
        return;
      } catch (err) {
        // User cancelled — do nothing
        if (err.name === 'AbortError') return;
        // Other error (e.g. expired activation) — fall through to modal
      }
    }

    // Fallback: open the share modal
    openModal(MODAL_TYPES.SHARE_FALLBACK, { name, url, text });
  }, [openModal]);

  return { shareInvite };
}
