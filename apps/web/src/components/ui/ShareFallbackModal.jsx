'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Mail } from 'lucide-react';
import { getShareText } from '../../hooks/useShare';
import './ShareFallbackModal.css';

/**
 * Desktop share modal (fallback when native share sheet isn't used).
 *
 * Displays Copy Link and Email options. On mobile, the native OS share sheet
 * handles sharing instead of this modal (see useShare hook).
 * Opened via ModalContext (SHARE_FALLBACK type).
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {function} props.onClose - Close handler
 * @param {string} props.name - Player name for the share text
 * @param {string} props.url - Invite URL to share
 * @param {string} props.text - Pre-formatted share text
 */
export default function ShareFallbackModal({ isOpen, onClose, name, url, text }) {
  const [copied, setCopied] = useState(false);

  const shareText = text || getShareText(name);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }, [url]);

  const handleEmail = useCallback(() => {
    const subject = encodeURIComponent('Beach League Invite');
    const body = encodeURIComponent(`${shareText}\n\n${url}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, [shareText, url]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <div
      className="share-fallback__overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Share invite link"
    >
      <div className="share-fallback">
        <div className="share-fallback__header">
          <span>Share Invite</span>
          <button
            type="button"
            className="share-fallback__close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="share-fallback__grid">
          <button
            type="button"
            className="share-fallback__option"
            onClick={handleCopy}
          >
            <span className="share-fallback__icon share-fallback__icon--copy">
              {copied ? <Check size={20} /> : <Copy size={20} />}
            </span>
            <span className="share-fallback__label">
              {copied ? 'Copied!' : 'Copy Link'}
            </span>
          </button>

          <button
            type="button"
            className="share-fallback__option"
            onClick={handleEmail}
          >
            <span className="share-fallback__icon share-fallback__icon--email">
              <Mail size={20} />
            </span>
            <span className="share-fallback__label">Email</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
