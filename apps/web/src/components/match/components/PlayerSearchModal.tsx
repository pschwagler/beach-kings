'use client';

import './PlayerSearchModal.css';
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
interface SearchedPlayer {
  id: number;
  name?: string | null;
  location_name?: string | null;
  gender?: string | null;
  level?: string | null;
}

interface CreatedPlaceholder {
  id?: number;
  player_id?: number;
  name: string;
  label?: string;
  inviteUrl?: string | null;
  invite_url?: string | null;
  inviteToken?: string | null;
  invite_token?: string | null;
}

interface PlayerSearchModalProps {
  isOpen: boolean;
  rawName: string;
  leagueId?: number;
  onSelect: (playerId: number, playerName: string) => void;
  onClose: () => void;
}

export default function PlayerSearchModal({ isOpen, rawName, leagueId, onSelect, onClose }: PlayerSearchModalProps) {
  const { query, setQuery, results, isLoading } = usePlayerSearch({ leagueId });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const suppressOverlayCloseRef = useRef(false);

  // Pre-fill search with the raw name when modal opens
  useEffect(() => {
    if (isOpen && rawName) {
      setQuery(rawName);
    }
  }, [isOpen, rawName, setQuery]);

  const handleSelect = useCallback((player: SearchedPlayer) => {
    onSelect(player.id, player.name || '');
  }, [onSelect]);

  const handleCreatePlaceholder = useCallback(async (name: string, extras: { gender?: string; level?: string } = {}): Promise<CreatedPlaceholder> => {
    const data: Record<string, unknown> = { name, ...extras };
    if (leagueId) {
      data.league_id = leagueId;
    }
    const result = await createPlaceholderPlayer(data);
    // API returns snake_case; PlaceholderCreateModal expects camelCase
    return {
      ...result,
      inviteUrl: result.invite_url || result.inviteUrl,
      inviteToken: result.invite_token || result.inviteToken,
    };
  }, [leagueId]);

  const handlePlaceholderClose = useCallback((createdPlayer: CreatedPlaceholder | null) => {
    // Suppress the next overlay click to prevent the PlayerSearchModal from closing
    // when PlaceholderCreateModal's overlay dismiss causes a click-through
    suppressOverlayCloseRef.current = true;
    setShowCreateModal(false);
    if (createdPlayer) {
      const id = createdPlayer.player_id || createdPlayer.id;
      const name = createdPlayer.name || createdPlayer.label || '';
      if (id !== undefined) {
        onSelect(id, name);
      }
    }
  }, [onSelect]);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
    </div>,
    document.body
  );
}
