'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GENDER_OPTIONS, SKILL_LEVEL_OPTIONS } from '../../utils/playerFilterOptions';
import useShare from '../../hooks/useShare';

/**
 * Two-step modal for creating a placeholder (unregistered) player.
 *
 * Step 1 (pre-creation): Editable player name, optional gender/level selects, and a Create button.
 * Step 2 (post-creation): Shows a success state with a Share Invite button.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {string} props.playerName - Initial name (editable by user)
 * @param {function} props.onCreate - Async (name, extras) => { name, inviteUrl, inviteToken } | null
 * @param {function} props.onClose - Called with createdPlayer object on success, or null on cancel
 * @param {string} [props.leagueGender] - Auto-fill gender from league context
 * @param {string} [props.leagueLevel] - Auto-fill level from league context
 */
export default function PlaceholderCreateModal({
  isOpen,
  playerName,
  onCreate,
  onClose,
  leagueGender = null,
  leagueLevel = null,
}) {
  const [editableName, setEditableName] = useState('');
  const [gender, setGender] = useState('');
  const [level, setLevel] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdPlayer, setCreatedPlayer] = useState(null);
  const [error, setError] = useState('');
  const { shareInvite } = useShare();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setEditableName(playerName || '');
      setGender(leagueGender || '');
      setLevel(leagueLevel || '');
      setIsCreating(false);
      setCreatedPlayer(null);
      setError('');
    }
  }, [isOpen, playerName, leagueGender, leagueLevel]);

  /**
   * Handle creating the placeholder player via the parent callback.
   */
  const handleCreate = useCallback(async () => {
    const trimmedName = editableName.trim();
    if (isCreating || !onCreate || !trimmedName) return;
    setIsCreating(true);
    setError('');
    try {
      const extras = {
        gender: gender || undefined,
        level: level || undefined,
      };
      const result = await onCreate(trimmedName, extras);
      if (result) {
        setCreatedPlayer({
          ...result,
          name: result.name || result.label || trimmedName,
        });
      } else {
        setError('Failed to create player');
      }
    } catch (err) {
      setError(err.message || 'Failed to create player');
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, onCreate, editableName, gender, level]);

  /**
   * Share invite URL via centralized share hook.
   */
  const handleShare = useCallback(() => {
    if (!createdPlayer?.inviteUrl) return;
    shareInvite({ name: createdPlayer.name, url: createdPlayer.inviteUrl });
  }, [createdPlayer, shareInvite]);

  /**
   * Close the modal, passing created player data (or null) to parent.
   */
  const handleClose = useCallback(() => {
    onClose(createdPlayer);
  }, [onClose, createdPlayer]);

  /**
   * Close on overlay click (only if clicking the overlay itself, not the card).
   */
  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <div
      className="placeholder-create-modal__overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={createdPlayer ? 'Player created' : `Create ${playerName}`}
    >
      <div className="placeholder-create-modal">
        {createdPlayer ? (
          /* ── Post-creation: success state ── */
          <>
            <div className="placeholder-create-modal__header">
              <span>Player Created</span>
              <button
                type="button"
                className="placeholder-create-modal__close"
                onClick={handleClose}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="placeholder-create-modal__body">
              <div className="placeholder-create-modal__success">
                <span className="placeholder-create-modal__check">&#10003;</span>
                <span>{createdPlayer.name} added</span>
              </div>
              {createdPlayer.inviteUrl && (
                <p className="placeholder-create-modal__share-text">
                  Share their invite link so they can claim their matches.
                </p>
              )}
            </div>
            <div className="placeholder-create-modal__actions">
              {createdPlayer.inviteUrl && (
                <button
                  type="button"
                  className="placeholder-create-modal__share-btn"
                  onClick={handleShare}
                >
                  Share Invite
                </button>
              )}
              <button
                type="button"
                className="placeholder-create-modal__done-btn"
                onClick={handleClose}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          /* ── Pre-creation: name + gender/level + create ── */
          <>
            <div className="placeholder-create-modal__header">
              <span>New Unregistered Player</span>
              <button
                type="button"
                className="placeholder-create-modal__close"
                onClick={handleClose}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="placeholder-create-modal__body">
              <input
                type="text"
                className="placeholder-create-modal__name"
                value={editableName}
                onChange={(e) => setEditableName(e.target.value)}
                aria-label="Player name"
                autoComplete="off"
              />
              <div className="placeholder-create-modal__fields">
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  aria-label="Gender"
                >
                  <option value="">Gender (optional)</option>
                  {GENDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  aria-label="Skill level"
                >
                  <option value="">Level (optional)</option>
                  {SKILL_LEVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <p className="placeholder-create-modal__hint">
                You&apos;ll get a link to share so they can claim their matches.
              </p>
              {error && (
                <div className="placeholder-create-modal__error" role="alert">
                  {error}
                </div>
              )}
            </div>
            <div className="placeholder-create-modal__actions">
              <button
                type="button"
                className="placeholder-create-modal__cancel-btn"
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="placeholder-create-modal__create-btn"
                onClick={handleCreate}
                disabled={isCreating || !editableName.trim()}
              >
                {isCreating ? 'Creating...' : 'Create Player'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
