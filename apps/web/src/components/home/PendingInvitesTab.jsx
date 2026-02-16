'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, Check, Share2 } from 'lucide-react';
import { listPlaceholderPlayers, deletePlaceholderPlayer } from '../../services/api';
import { Button } from '../ui/UI';
import ConfirmationModal from '../modal/ConfirmationModal';
import Toast, { ToastContainer, useToasts } from '../ui/Toast';

/**
 * PendingInvitesTab — manages placeholder players created by the current user.
 *
 * Shows a card list of pending invite placeholders with actions:
 * copy invite link, delete placeholder. Accessible from the Home
 * sidebar / More menu as its own tab.
 */
export default function PendingInvitesTab() {
  const [placeholders, setPlaceholders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Copy feedback — track which card just copied
  const [copiedId, setCopiedId] = useState(null);

  const [toasts, addToast, dismissToast] = useToasts();

  const fetchPlaceholders = useCallback(async (signal) => {
    try {
      setError(null);
      const data = await listPlaceholderPlayers();
      if (signal?.aborted) return;
      // Show only pending placeholders, sorted newest-first
      const pending = (data.placeholders || [])
        .filter((p) => p.status === 'pending')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setPlaceholders(pending);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error loading placeholders:', err);
      setError('Failed to load pending invites');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchPlaceholders(controller.signal);
    return () => controller.abort();
  }, [fetchPlaceholders]);

  /**
   * Share invite URL via navigator.share with clipboard copy fallback.
   */
  const handleShare = async (placeholder) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Beach League Invite',
          url: placeholder.invite_url,
          text: `${placeholder.name} — claim your matches on Beach League`,
        });
        return;
      }
      await navigator.clipboard.writeText(placeholder.invite_url);
      setCopiedId(placeholder.player_id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      if (err.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(placeholder.invite_url);
          setCopiedId(placeholder.player_id);
          setTimeout(() => setCopiedId(null), 2000);
        } catch {
          addToast('Failed to share link');
        }
      }
    }
  };

  /**
   * Open delete confirmation modal.
   */
  const handleDeleteClick = (placeholder) => {
    setDeleteTarget(placeholder);
    setShowDeleteModal(true);
  };

  /**
   * Execute delete after user confirms.
   */
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await deletePlaceholderPlayer(deleteTarget.player_id);
      addToast(
        `Removed ${deleteTarget.name}. ${result.affected_matches} match${result.affected_matches === 1 ? '' : 'es'} updated.`
      );
      setPlaceholders((prev) =>
        prev.filter((p) => p.player_id !== deleteTarget.player_id)
      );
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to delete placeholder');
    } finally {
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  /**
   * Build initials from a name string (e.g. "John Smith" → "JS").
   */
  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .slice(0, 2)
      .join('');
  };

  /**
   * Format a UTC timestamp into a short relative or absolute date.
   */
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / 86400000);
    if (diffDays < 1) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // ---------- Render ----------

  if (isLoading) {
    return (
      <div className="profile-page__section league-section">
        <h2 className="profile-page__section-title section-title-first">Pending Invites</h2>
        <div className="pending-invites__loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="profile-page__section league-section">
      <h2 className="profile-page__section-title section-title-first">Pending Invites</h2>

      {error && (
        <div className="pending-invites__error">{error}</div>
      )}

      {!error && placeholders.length === 0 ? (
        <div className="pending-invites__empty">
          <UserPlus size={48} className="pending-invites__empty-icon" />
          <p className="pending-invites__empty-title">No pending invites</p>
          <p className="pending-invites__empty-desc">
            During match creation or session setup, you can type a new name and create a placeholder player on the spot. They&apos;ll appear here with an invite link to share.
          </p>
        </div>
      ) : (
        <div className="pending-invites__list">
          {placeholders.map((p) => (
            <div key={p.player_id} className="pending-invites__card">
              <div className="pending-invites__avatar">
                {getInitials(p.name)}
              </div>

              <div className="pending-invites__info">
                <div className="pending-invites__name">{p.name}</div>
                {p.phone_number && (
                  <div className="pending-invites__phone">{p.phone_number}</div>
                )}
                <div className="pending-invites__meta">
                  <span className="pending-invites__matches">
                    {p.match_count} match{p.match_count === 1 ? '' : 'es'}
                  </span>
                  <span className="pending-invites__date">{formatDate(p.created_at)}</span>
                </div>
              </div>

              <div className="pending-invites__actions">
                <Button
                  variant="outline"
                  className="pending-invites__copy-btn"
                  onClick={() => handleShare(p)}
                  title="Share invite link"
                >
                  {copiedId === p.player_id ? (
                    <>
                      <Check size={14} />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Share2 size={14} />
                      <span>Share</span>
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="pending-invites__delete-btn"
                  onClick={() => handleDeleteClick(p)}
                  title="Delete placeholder"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Placeholder Player"
        message={
          deleteTarget
            ? `This will replace "${deleteTarget.name}" with "Unknown Player" in ${deleteTarget.match_count} match${deleteTarget.match_count === 1 ? '' : 'es'}. Those matches will become permanently unranked. This cannot be undone.`
            : ''
        }
        confirmText="Delete"
        confirmButtonClass="danger"
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
