'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, Search, MapPin, UserPlus, UserCheck, UserX, X } from 'lucide-react';
import { Button } from '../ui/UI';
import { ToastContainer, useToasts } from '../ui/Toast';
import LevelBadge from '../ui/LevelBadge';
import {
  getFriends,
  getFriendRequests,
  getFriendSuggestions,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '../../services/api';
import { isImageUrl } from '../../utils/avatar';
import { slugify } from '../../utils/slugify';
import './FriendsTab.css';

/**
 * Format a timestamp into a relative time string.
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Avatar helper: renders image or initials.
 */
function Avatar({ avatar, name, className }) {
  if (isImageUrl(avatar)) {
    return (
      <div className={className}>
        <img src={avatar} alt={name} />
      </div>
    );
  }
  return (
    <div className={className}>
      {avatar || name?.charAt(0) || '?'}
    </div>
  );
}

/**
 * FriendsTab — shows pending requests, friends list, and suggestions.
 * Displayed on the Home page when ?tab=friends.
 */
export default function FriendsTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState([]);
  const [friendsTotalCount, setFriendsTotalCount] = useState(0);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [confirmUnfriend, setConfirmUnfriend] = useState(null);
  const [toasts, addToast, dismissToast] = useToasts();

  // Load all data on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [friendsData, inData, outData, suggestionsData] = await Promise.all([
          getFriends(1, 100),
          getFriendRequests('incoming'),
          getFriendRequests('outgoing'),
          getFriendSuggestions(10),
        ]);
        setFriends(friendsData.items || []);
        setFriendsTotalCount(friendsData.total_count || 0);
        setIncomingRequests(inData || []);
        setOutgoingRequests(outData || []);
        setSuggestions(suggestionsData || []);
      } catch (err) {
        console.error('Error loading friends data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const setActionLoadingFor = (key, value) => {
    setActionLoading((prev) => ({ ...prev, [key]: value }));
  };

  const handleAccept = useCallback(async (requestId) => {
    setActionLoadingFor(`accept-${requestId}`, true);
    try {
      await acceptFriendRequest(requestId);
      // Refresh data
      const [friendsData, inData] = await Promise.all([
        getFriends(1, 100),
        getFriendRequests('incoming'),
      ]);
      setFriends(friendsData.items || []);
      setFriendsTotalCount(friendsData.total_count || 0);
      setIncomingRequests(inData || []);
      // Also refresh suggestions since accepted friend should disappear
      const sugData = await getFriendSuggestions(10);
      setSuggestions(sugData || []);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to accept friend request');
    } finally {
      setActionLoadingFor(`accept-${requestId}`, false);
    }
  }, []);

  const handleDecline = useCallback(async (requestId) => {
    setActionLoadingFor(`decline-${requestId}`, true);
    try {
      await declineFriendRequest(requestId);
      setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to decline friend request');
    } finally {
      setActionLoadingFor(`decline-${requestId}`, false);
    }
  }, []);

  const handleCancelOutgoing = useCallback(async (requestId) => {
    setActionLoadingFor(`cancel-${requestId}`, true);
    try {
      await cancelFriendRequest(requestId);
      setOutgoingRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to cancel friend request');
    } finally {
      setActionLoadingFor(`cancel-${requestId}`, false);
    }
  }, []);

  const handleUnfriend = useCallback(async (playerId) => {
    setActionLoadingFor(`unfriend-${playerId}`, true);
    try {
      await removeFriend(playerId);
      setFriends((prev) => prev.filter((f) => f.player_id !== playerId));
      setFriendsTotalCount((prev) => prev - 1);
      setConfirmUnfriend(null);
      // Refresh suggestions
      const sugData = await getFriendSuggestions(10);
      setSuggestions(sugData || []);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to remove friend');
    } finally {
      setActionLoadingFor(`unfriend-${playerId}`, false);
    }
  }, []);

  const handleSendRequest = useCallback(async (playerId) => {
    setActionLoadingFor(`send-${playerId}`, true);
    try {
      await sendFriendRequest(playerId);
      // Remove from suggestions, add to outgoing
      setSuggestions((prev) => prev.filter((s) => s.player_id !== playerId));
      const outData = await getFriendRequests('outgoing');
      setOutgoingRequests(outData || []);
    } catch (err) {
      addToast(err.response?.data?.detail || 'Failed to send friend request');
    } finally {
      setActionLoadingFor(`send-${playerId}`, false);
    }
  }, []);

  // Filter friends by search query
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const q = searchQuery.toLowerCase();
    return friends.filter((f) => f.full_name?.toLowerCase().includes(q));
  }, [friends, searchQuery]);

  if (loading) {
    return (
      <div className="profile-page__section league-section">
        <h2 className="profile-page__section-title section-title-first">Friends</h2>
        <div className="friends-tab__loading">Loading friends...</div>
      </div>
    );
  }

  return (
    <div className="profile-page__section league-section">
      <h2 className="profile-page__section-title section-title-first">Friends</h2>

      {/* Incoming Requests */}
      {incomingRequests.length > 0 && (
        <div className="friends-tab__section">
          <div className="friends-tab__section-header">
            <h3 className="friends-tab__section-title">
              Friend Requests
              <span className="friends-tab__badge-count">{incomingRequests.length}</span>
            </h3>
          </div>
          <div className="friends-tab__requests">
            {incomingRequests.map((req) => (
              <div key={req.id} className="friends-tab__request-card">
                <Avatar
                  avatar={req.sender_avatar}
                  name={req.sender_name}
                  className="friends-tab__request-avatar"
                />
                <div className="friends-tab__request-info">
                  <div className="friends-tab__request-name">{req.sender_name}</div>
                  <div className="friends-tab__request-time">
                    {formatRelativeTime(req.created_at)}
                  </div>
                </div>
                <div className="friends-tab__request-actions">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleAccept(req.id)}
                    disabled={actionLoading[`accept-${req.id}`]}
                  >
                    {actionLoading[`accept-${req.id}`] ? '...' : 'Accept'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDecline(req.id)}
                    disabled={actionLoading[`decline-${req.id}`]}
                  >
                    {actionLoading[`decline-${req.id}`] ? '...' : 'Decline'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing Requests */}
      {outgoingRequests.length > 0 && (
        <div className="friends-tab__section">
          <div className="friends-tab__section-header">
            <h3 className="friends-tab__section-title">Sent Requests</h3>
          </div>
          <div className="friends-tab__requests">
            {outgoingRequests.map((req) => (
              <div key={req.id} className="friends-tab__request-card">
                <Avatar
                  avatar={req.receiver_avatar}
                  name={req.receiver_name}
                  className="friends-tab__request-avatar"
                />
                <div className="friends-tab__request-info">
                  <div className="friends-tab__request-name">{req.receiver_name}</div>
                  <div className="friends-tab__request-time">
                    Sent {formatRelativeTime(req.created_at)}
                  </div>
                </div>
                <div className="friends-tab__request-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelOutgoing(req.id)}
                    disabled={actionLoading[`cancel-${req.id}`]}
                  >
                    {actionLoading[`cancel-${req.id}`] ? '...' : 'Cancel'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Friends */}
      <div className="friends-tab__section">
        <div className="friends-tab__section-header">
          <h3 className="friends-tab__section-title">
            My Friends ({friendsTotalCount})
          </h3>
        </div>

        {friendsTotalCount > 5 && (
          <div className="friends-tab__search">
            <Search size={16} className="friends-tab__search-icon" />
            <input
              type="text"
              placeholder="Search friends..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="friends-tab__search-input"
            />
          </div>
        )}

        {filteredFriends.length === 0 ? (
          <div className="friends-tab__empty">
            {friendsTotalCount === 0 ? (
              <>
                <Users size={32} className="friends-tab__empty-icon" />
                <p>No friends yet. Send a request or check out suggestions below!</p>
              </>
            ) : (
              <p>No friends match &ldquo;{searchQuery}&rdquo;</p>
            )}
          </div>
        ) : (
          <div className="friends-tab__list">
            {filteredFriends.map((friend) => (
              <div key={friend.player_id} className="friends-tab__friend-card">
                <Link
                  href={`/player/${friend.player_id}/${slugify(friend.full_name)}`}
                  style={{ display: 'contents' }}
                >
                  <Avatar
                    avatar={friend.avatar}
                    name={friend.full_name}
                    className="friends-tab__friend-avatar"
                  />
                  <div className="friends-tab__friend-info">
                    <div className="friends-tab__friend-name">{friend.full_name}</div>
                    <div className="friends-tab__friend-meta">
                      {friend.location_name && (
                        <span>
                          <MapPin size={11} /> {friend.location_name}
                        </span>
                      )}
                      {friend.level && <LevelBadge level={friend.level} />}
                    </div>
                  </div>
                </Link>
                <div className="friends-tab__friend-actions">
                  {confirmUnfriend === friend.player_id ? (
                    <div className="friends-tab__confirm">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleUnfriend(friend.player_id)}
                        disabled={actionLoading[`unfriend-${friend.player_id}`]}
                      >
                        {actionLoading[`unfriend-${friend.player_id}`] ? '...' : 'Confirm'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmUnfriend(null)}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmUnfriend(friend.player_id)}
                      title="Remove friend"
                    >
                      <UserX size={16} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* People You May Know */}
      {suggestions.length > 0 && (
        <div className="friends-tab__section">
          <div className="friends-tab__section-header">
            <h3 className="friends-tab__section-title">People You May Know</h3>
          </div>
          <div className="friends-tab__suggestions">
            {suggestions.map((suggestion) => (
              <div key={suggestion.player_id} className="friends-tab__suggestion-card">
                <Avatar
                  avatar={suggestion.avatar}
                  name={suggestion.full_name}
                  className="friends-tab__suggestion-avatar"
                />
                <div className="friends-tab__suggestion-info">
                  <Link
                    href={`/player/${suggestion.player_id}/${slugify(suggestion.full_name)}`}
                    className="friends-tab__suggestion-name"
                  >
                    {suggestion.full_name}
                  </Link>
                  <div className="friends-tab__suggestion-detail">
                    {suggestion.shared_league_count} shared league{suggestion.shared_league_count !== 1 ? 's' : ''}
                    {suggestion.location_name && ` · ${suggestion.location_name}`}
                  </div>
                </div>
                <div className="friends-tab__suggestion-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSendRequest(suggestion.player_id)}
                    disabled={actionLoading[`send-${suggestion.player_id}`]}
                  >
                    {actionLoading[`send-${suggestion.player_id}`] ? '...' : (
                      <>
                        <UserPlus size={14} /> Add
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
