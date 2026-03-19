'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Loader2, UserPlus } from 'lucide-react';
import { usePlayerSearch } from '../hooks/usePlayerSearch';
import { createPlaceholderPlayer } from '../../../services/api';
import PlaceholderCreateModal from '../../player/PlaceholderCreateModal';

/**
 * Modal for searching and selecting a player to resolve an unrecognized name.
 * Includes "+ Add New Player" to create a placeholder via PlaceholderCreateModal.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {string} props.rawName - The unrecognized name being resolved
 * @param {number} [props.leagueId] - League context for search scoping
 * @param {function} props.onSelect - Called with (playerId, playerName) on resolution
 * @param {function} props.onClose - Called when modal is dismissed without selection
 */
export default function PlayerSearchModal({ isOpen, rawName, leagueId, onSelect, onClose }) {
  const { query, setQuery, results, isLoading } = usePlayerSearch({ leagueId });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const suppressOverlayCloseRef = useRef(false);

  // Pre-fill search with the raw name when modal opens
  useEffect(() => {
    if (isOpen && rawName) {
      setQuery(rawName);
    }
  }, [isOpen, rawName, setQuery]);

  const handleSelect = useCallback((player) => {
    onSelect(player.id, player.name || '');
  }, [onSelect]);

  const handleCreatePlaceholder = useCallback(async (name, extras) => {
    const data = { name, ...extras };
    if (leagueId) {
      data.league_id = leagueId;
    }
    const result = await createPlaceholderPlayer(data);
    return result;
  }, [leagueId]);

  const handlePlaceholderClose = useCallback((createdPlayer) => {
    // Suppress the next overlay click to prevent the PlayerSearchModal from closing
    // when PlaceholderCreateModal's overlay dismiss causes a click-through
    suppressOverlayCloseRef.current = true;
    setShowCreateModal(false);
    if (createdPlayer) {
      const id = createdPlayer.player_id || createdPlayer.id;
      const name = createdPlayer.name || createdPlayer.label || '';
      onSelect(id, name);
    }
  }, [onSelect]);

  const handleOverlayClick = useCallback((e) => {
    // Don't close if PlaceholderCreateModal is open, or if it just closed
    // (the same click that closes PlaceholderCreateModal can land on this overlay)
    if (e.target === e.currentTarget && !showCreateModal && !suppressOverlayCloseRef.current) {
      onClose();
    }
    suppressOverlayCloseRef.current = false;
  }, [onClose, showCreateModal]);

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <div onClick={(e) => e.stopPropagation()}>
      <div
        className="player-search-modal__overlay"
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-label={`Find player: ${rawName}`}
      >
        <div className="player-search-modal" onClick={(e) => e.stopPropagation()}>
          <div className="player-search-modal__header">
            <h3 className="player-search-modal__title">
              Find player: <em>{rawName}</em>
            </h3>
            <button
              type="button"
              className="player-search-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="player-search-modal__search">
            <Search size={16} className="player-search-modal__search-icon" />
            <input
              type="text"
              className="player-search-modal__input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name..."
              autoFocus
              autoComplete="off"
            />
            {isLoading && (
              <Loader2 size={16} className="player-search-modal__spinner" />
            )}
          </div>

          <div className="player-search-modal__results">
            {results.length > 0 ? (
              <ul className="player-search-modal__list">
                {results.map((player) => {
                  const id = player.id;
                  const name = player.name || '';
                  const location = player.location_name || '';
                  const gender = player.gender || '';
                  const level = player.level || '';
                  const meta = [location, gender, level]
                    .filter(Boolean)
                    .join(' \u00B7 ');

                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="player-search-modal__result"
                        onClick={() => handleSelect(player)}
                      >
                        <span className="player-search-modal__result-name">{name}</span>
                        {meta && (
                          <span className="player-search-modal__result-meta">{meta}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : query.trim().length >= 2 && !isLoading ? (
              <p className="player-search-modal__empty">No players found</p>
            ) : null}
          </div>

          <button
            type="button"
            className="player-search-modal__add-new"
            onClick={() => setShowCreateModal(true)}
          >
            <UserPlus size={16} />
            Add New Player
          </button>
        </div>
      </div>

      <PlaceholderCreateModal
        isOpen={showCreateModal}
        playerName={query.trim() || rawName}
        onCreate={handleCreatePlaceholder}
        onClose={handlePlaceholderClose}
      />

      <style jsx global>{`
        .player-search-modal__overlay {
          position: fixed;
          inset: 0;
          z-index: 10001;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .player-search-modal {
          background: white;
          border-radius: 12px;
          width: 100%;
          max-width: 440px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
        }

        .player-search-modal__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 16px 12px;
          border-bottom: 1px solid var(--gray-200, #e5e7eb);
        }

        .player-search-modal__title {
          font-size: 15px;
          font-weight: 600;
          margin: 0;
          color: var(--gray-900, #111827);
        }

        .player-search-modal__title em {
          color: var(--warning-text, #d97706);
          font-style: italic;
        }

        .player-search-modal__close {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          color: var(--gray-600, #4b5563);
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 32px;
          min-height: 32px;
        }

        .player-search-modal__close:hover {
          background: var(--gray-100, #f3f4f6);
        }

        .player-search-modal__search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--gray-200, #e5e7eb);
        }

        .player-search-modal__search-icon {
          color: var(--gray-600, #4b5563);
          flex-shrink: 0;
        }

        .player-search-modal__input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 15px;
          font-family: inherit;
          color: var(--gray-900, #111827);
          background: transparent;
          min-width: 0;
        }

        .player-search-modal__input::placeholder {
          color: var(--gray-600, #9ca3af);
        }

        .player-search-modal__spinner {
          animation: spin 1s linear infinite;
          color: var(--gray-600, #9ca3af);
          flex-shrink: 0;
        }

        .player-search-modal__results {
          flex: 1;
          overflow-y: auto;
          min-height: 80px;
          max-height: 300px;
        }

        .player-search-modal__list {
          list-style: none;
          margin: 0;
          padding: 4px 0;
        }

        .player-search-modal__result {
          display: flex;
          flex-direction: column;
          gap: 2px;
          width: 100%;
          padding: 10px 16px;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          min-height: 44px;
          justify-content: center;
        }

        .player-search-modal__result:hover {
          background: var(--gray-50, #f9fafb);
        }

        .player-search-modal__result:active {
          background: var(--gray-100, #f3f4f6);
        }

        .player-search-modal__result-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--gray-900, #111827);
        }

        .player-search-modal__result-meta {
          font-size: 12px;
          color: var(--gray-600, #6b7280);
        }

        .player-search-modal__empty {
          padding: 24px 16px;
          text-align: center;
          color: var(--gray-600, #6b7280);
          font-size: 13px;
          margin: 0;
        }

        .player-search-modal__add-new {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 16px;
          margin: 8px 12px 12px;
          background: none;
          border: 1px dashed var(--gray-300, #d1d5db);
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-family: inherit;
          font-weight: 500;
          color: var(--primary, #3b82f6);
          min-height: 44px;
          transition: background 0.15s, border-color 0.15s;
        }

        .player-search-modal__add-new:hover {
          background: var(--primary-lighter, #eff6ff);
          border-color: var(--primary, #3b82f6);
        }

        /* Ensure PlaceholderCreateModal sits above this modal */
        .placeholder-create-modal__overlay {
          z-index: 10002 !important;
        }

        @media (max-width: 480px) {
          .player-search-modal {
            max-width: 100%;
            max-height: 90vh;
            margin: 8px;
          }

          .player-search-modal__input {
            font-size: 16px;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
