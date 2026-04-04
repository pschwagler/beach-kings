'use client';

import React, { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle, ArrowLeft, Send, Loader2, PenSquare, Search } from 'lucide-react';
import { Button } from '../ui/UI';
import api, {
  getConversations,
  getThread,
  sendMessage,
  markThreadRead,
  getFriends,
  batchFriendStatus,
} from '../../services/api';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import { isImageUrl } from '../../utils/avatar';
import { formatRelativeTime } from '../../utils/dateUtils';
import './MessagesTab.css';

const MAX_CHARS = 500;

/**
 * Format time for message bubbles (e.g. "2:30 PM").
 */
function formatMessageTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Get a date label for date separators.
 */
function getDateLabel(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/**
 * Build two-letter initials from a full name (e.g. "Colan Gulla" → "CG").
 */
function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

interface AvatarProps {
  avatar: string | null | undefined;
  name: string | null | undefined;
}

/**
 * Avatar helper: renders image or initials.
 */
function Avatar({ avatar, name }: AvatarProps) {
  if (isImageUrl(avatar)) {
    return (
      <div className="messages-tab__avatar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar ?? undefined} alt={name ?? undefined} />
      </div>
    );
  }
  return (
    <div className="messages-tab__avatar">
      {avatar || getInitials(name)}
    </div>
  );
}

interface ConversationItem {
  player_id: number;
  full_name: string;
  avatar?: string | null;
  is_friend?: boolean;
  unread_count: number;
  last_message_text?: string | null;
  last_message_at?: string | null;
}

interface FriendItem {
  player_id: number;
  full_name: string;
  avatar?: string | null;
}

interface ThreadInfo {
  playerId: number;
  name: string;
  avatar: string | null;
  isFriend: boolean;
}

interface ConversationListProps {
  onOpenThread: (playerId: number, name: string, avatar: string | null | undefined, isFriend: boolean | undefined) => void;
}

// ============================================================================
// ConversationList
// ============================================================================

function ConversationList({ onOpenThread }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getConversations();
        if (!cancelled) setConversations(data.items || []);
      } catch (err: unknown) {
        console.error('Error loading conversations:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="messages-tab__loading">
        <Loader2 size={28} className="spin" />
      </div>
    );
  }

  if (showPicker) {
    return (
      <FriendPicker
        onSelect={(friend) => {
          setShowPicker(false);
          onOpenThread(friend.player_id, friend.full_name, friend.avatar, true);
        }}
        onBack={() => setShowPicker(false)}
        existingConversationIds={conversations.map((c) => c.player_id)}
      />
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="messages-tab__empty">
        <MessageCircle size={48} className="messages-tab__empty-icon" />
        <h3 className="messages-tab__empty-heading">No conversations yet</h3>
        <p className="messages-tab__empty-text">
          Send a message to a friend to get started!
        </p>
        <Button onClick={() => setShowPicker(true)} data-testid="new-message-btn">
          New Message
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="messages-tab__header">
        <h2 className="messages-tab__title">Messages</h2>
        <button
          className="messages-tab__compose-btn"
          onClick={() => setShowPicker(true)}
          title="New message"
          data-testid="new-message-btn"
        >
          <PenSquare size={20} />
        </button>
      </div>
      <div className="messages-tab__conversation-list">
        {conversations.map((conv) => {
          const hasUnread = conv.unread_count > 0;
          return (
            <button
              key={conv.player_id}
              className={`messages-tab__conversation-card${hasUnread ? ' messages-tab__conversation-card--unread' : ''}`}
              onClick={() => onOpenThread(conv.player_id, conv.full_name, conv.avatar, conv.is_friend)}
              data-testid={`conversation-${conv.player_id}`}
            >
              <Avatar avatar={conv.avatar} name={conv.full_name} />
              <div className="messages-tab__conversation-info">
                <p className="messages-tab__conversation-name">{conv.full_name}</p>
                <p className={`messages-tab__conversation-preview${hasUnread ? ' messages-tab__conversation-preview--unread' : ''}`}>
                  {conv.last_message_text}
                </p>
              </div>
              <div className="messages-tab__conversation-meta">
                <span className="messages-tab__conversation-time">
                  {formatRelativeTime(conv.last_message_at) ?? ''}
                </span>
                {hasUnread && <div className="messages-tab__unread-dot" />}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

interface FriendPickerProps {
  onSelect: (friend: FriendItem) => void;
  onBack: () => void;
  existingConversationIds: number[];
}

// ============================================================================
// FriendPicker — select a friend to start a new conversation
// ============================================================================

function FriendPicker({ onSelect, onBack, existingConversationIds }: FriendPickerProps) {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getFriends(1, 100);
        if (!cancelled) setFriends(data.items || []);
      } catch (err: unknown) {
        console.error('Error loading friends:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = friends.filter((f) => {
    if (search && !f.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="messages-tab__picker">
      <div className="messages-tab__picker-header">
        <button className="messages-tab__back-btn" onClick={onBack} data-testid="picker-back-btn">
          <ArrowLeft size={20} />
        </button>
        <h2 className="messages-tab__title">New Message</h2>
      </div>
      <div className="messages-tab__picker-search">
        <Search size={16} className="messages-tab__picker-search-icon" />
        <input
          type="text"
          className="messages-tab__picker-search-input"
          placeholder="Search friends..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          data-testid="picker-search-input"
        />
      </div>
      {loading ? (
        <div className="messages-tab__loading">
          <Loader2 size={28} className="spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="messages-tab__picker-empty">
          {friends.length === 0
            ? 'Add friends to start messaging'
            : 'No friends match your search'}
        </div>
      ) : (
        <div className="messages-tab__picker-list">
          {filtered.map((friend) => {
            const hasExisting = existingConversationIds.includes(friend.player_id);
            return (
              <button
                key={friend.player_id}
                className="messages-tab__picker-item"
                onClick={() => onSelect(friend)}
                data-testid={`picker-friend-${friend.player_id}`}
              >
                <Avatar avatar={friend.avatar} name={friend.full_name} />
                <span className="messages-tab__picker-name">{friend.full_name}</span>
                {hasExisting && <span className="messages-tab__picker-existing">Existing</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface MessageItem {
  id?: number | null;
  sender_player_id: number;
  message_text: string;
  created_at: string;
}

interface ThreadViewProps {
  otherPlayerId: number;
  otherPlayerName: string;
  otherPlayerAvatar: string | null | undefined;
  isFriend: boolean | undefined;
  onBack: () => void;
}

// ============================================================================
// ThreadView
// ============================================================================

function ThreadView({ otherPlayerId, otherPlayerName, otherPlayerAvatar, isFriend: initialIsFriend, onBack }: ThreadViewProps) {
  const { currentUserPlayer } = useAuth();
  const { onDirectMessageRef, fetchDmUnreadCount } = useNotifications();

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isFriend, setIsFriend] = useState(initialIsFriend !== false);

  const containerRef = useRef<HTMLDivElement>(null);
  const myPlayerId = currentUserPlayer?.id;

  // Scroll messages container to top when thread opens
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  // Load initial thread
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getThread(otherPlayerId, 1, 50);
        if (!cancelled) {
          // Messages come newest-first from API; reverse for chronological display
          setMessages((data.items || []).reverse());
          setHasMore(data.has_more ?? false);
        }
      } catch (err) {
        console.error('Error loading thread:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [otherPlayerId]);

  // Mark thread as read on open
  useEffect(() => {
    (async () => {
      try {
        await markThreadRead(otherPlayerId);
        // Refresh the DM badge count
        fetchDmUnreadCount();
      } catch (err: unknown) {
        console.error('Error marking thread read:', err);
      }
    })();
  }, [otherPlayerId, fetchDmUnreadCount]);

  // Subscribe to real-time incoming messages
  useEffect(() => {
    const handler = (msg: Record<string, unknown>) => {
      const typedMsg = msg as unknown as MessageItem;
      // Only accept messages from this thread's other player
      if (typedMsg.sender_player_id === otherPlayerId) {
        setMessages((prev) => [...prev, typedMsg]);
        // Auto-mark as read since user is viewing this thread
        markThreadRead(otherPlayerId)
          .then(() => fetchDmUnreadCount())
          .catch(() => {});
      }
    };
    onDirectMessageRef.current = handler;
    return () => {
      onDirectMessageRef.current = null;
    };
  }, [otherPlayerId, onDirectMessageRef, fetchDmUnreadCount]);

  // Auto-scroll to bottom on new messages (within the messages container only)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  // Load older messages
  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    try {
      const data = await getThread(otherPlayerId, nextPage, 50);
      const older = (data.items || []).reverse();
      setMessages((prev) => [...older, ...prev]);
      setHasMore(data.has_more ?? false);
      setPage(nextPage);
    } catch (err: unknown) {
      console.error('Error loading more messages:', err);
    }
  }, [page, otherPlayerId]);

  // Send message
  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setSendError(null);
    try {
      const newMsg = await sendMessage(otherPlayerId, trimmed);
      setMessages((prev) => [...prev, newMsg]);
      setText('');
    } catch (err: unknown) {
      console.error('Error sending message:', err);
      setSendError('Message failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  }, [text, sending, otherPlayerId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="messages-tab__loading">
        <Loader2 size={28} className="spin" />
      </div>
    );
  }

  // Group messages with date separators
  let lastDateLabel: string | null = null;

  return (
    <div className="messages-tab__thread">
      <div className="messages-tab__thread-header">
        <button className="messages-tab__back-btn" onClick={onBack} title="Back" type="button">
          <ArrowLeft size={20} />
        </button>
        <Avatar avatar={otherPlayerAvatar} name={otherPlayerName} />
        <h3 className="messages-tab__thread-name">{otherPlayerName}</h3>
        {!isFriend && (
          <span className="messages-tab__thread-readonly">Not friends</span>
        )}
      </div>

      <div className="messages-tab__messages-container" ref={containerRef}>
        {hasMore && (
          <div className="messages-tab__load-more">
            <button className="messages-tab__load-more-btn" onClick={loadMore} type="button">
              Load older messages
            </button>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMine = msg.sender_player_id === myPlayerId;
          const dateLabel = getDateLabel(msg.created_at);
          let showDateSeparator = false;
          if (dateLabel !== lastDateLabel) {
            showDateSeparator = true;
            lastDateLabel = dateLabel;
          }

          return (
            <div key={msg.id ?? `msg-${idx}`}>
              {showDateSeparator && (
                <div className="messages-tab__date-separator">{dateLabel}</div>
              )}
              <div className={`messages-tab__message-row messages-tab__message-row--${isMine ? 'mine' : 'theirs'}`}>
                <div className={`messages-tab__bubble messages-tab__bubble--${isMine ? 'mine' : 'theirs'}`}>
                  {msg.message_text}
                  <div className="messages-tab__bubble-time">
                    {formatMessageTime(msg.created_at)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {sendError && (
        <p className="messages-tab__send-error">{sendError}</p>
      )}
      {isFriend ? (
        <div className="messages-tab__input-area">
          <div className="messages-tab__input-wrapper">
            <textarea
              className="messages-tab__input"
              placeholder="Type a message..."
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={handleKeyDown}
              rows={1}
              data-testid="message-input"
            />
            {text.length > MAX_CHARS - 50 && (
              <span className={`messages-tab__char-count${text.length >= MAX_CHARS ? ' messages-tab__char-count--warn' : ''}`}>
                {text.length}/{MAX_CHARS}
              </span>
            )}
          </div>
          <button
            className="messages-tab__send-btn"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            title="Send"
            type="button"
            data-testid="send-message-btn"
          >
            <Send size={18} />
          </button>
        </div>
      ) : (
        <div className="messages-tab__readonly-notice">
          You must be friends to send messages.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MessagesTab (top-level)
// ============================================================================

export default function MessagesTab() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();

  // thread param from URL (e.g. ?tab=messages&thread=123)
  const threadPlayerId = searchParams?.get('thread');
  const [threadInfo, setThreadInfo] = useState<ThreadInfo | null>(null);

  // Sync threadInfo with URL: clear when thread param is removed
  useEffect(() => {
    if (!threadPlayerId && threadInfo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync URL param to local state
      setThreadInfo(null);
    }
  }, [threadPlayerId, threadInfo]);

  // If URL has a thread param but we don't have player info yet, load conversations to find it
  useEffect(() => {
    if (threadPlayerId && !threadInfo) {
      (async () => {
        try {
          const data = await getConversations(1, 100);
          const conv = ((data.items || []) as ConversationItem[]).find(
            (c) => String(c.player_id) === String(threadPlayerId)
          );
          if (conv) {
            setThreadInfo({
              playerId: conv.player_id,
              name: conv.full_name,
              avatar: conv.avatar ?? null,
              isFriend: conv.is_friend ?? false,
            });
          } else {
            // No existing conversation — fetch player info and check friendship
            try {
              const [playerRes, statusData] = await Promise.all([
                api.get(`/api/public/players/${threadPlayerId}`),
                batchFriendStatus([Number(threadPlayerId)]),
              ]);
              const p = playerRes.data;
              setThreadInfo({
                playerId: p.id,
                name: p.full_name,
                avatar: p.avatar || null,
                isFriend: statusData.statuses?.[String(p.id)] === 'friend',
              });
            } catch (innerErr) {
              // Do not open the thread with isFriend: false — a transient lookup failure
              // must not silently lock the UI into read-only "not friends" mode.
              console.error('Error fetching thread player info:', innerErr);
            }
          }
        } catch (err: unknown) {
          console.error('Error resolving thread player:', err);
        }
      })();
    }
  }, [threadPlayerId, threadInfo]);

  const openThread = useCallback((playerId: number, name: string, avatar: string | null | undefined, isFriend: boolean | undefined) => {
    setThreadInfo({ playerId, name, avatar: avatar ?? null, isFriend: isFriend ?? false });
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'messages');
    params.set('thread', String(playerId));
    startTransition(() => router.push(`/home?${params.toString()}`));
  }, [router, startTransition]);

  const closeThread = useCallback(() => {
    setThreadInfo(null);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'messages');
    params.delete('thread');
    startTransition(() => router.push(`/home?${params.toString()}`));
  }, [router, startTransition]);

  if (threadInfo) {
    return (
      <ThreadView
        otherPlayerId={threadInfo.playerId}
        otherPlayerName={threadInfo.name}
        otherPlayerAvatar={threadInfo.avatar}
        isFriend={threadInfo.isFriend}
        onBack={closeThread}
      />
    );
  }

  return <ConversationList onOpenThread={openThread} />;
}
