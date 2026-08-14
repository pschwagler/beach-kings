import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { getLeagueMessages, createLeagueMessage } from '../../services/api';
import MessageBubble from '../messages/MessageBubble';
import MessageComposer from '../messages/MessageComposer';
import './LeagueMessagesTab.css';

interface LeagueMessage {
  id: number;
  player_id: number;
  player_name: string | null;
  avatar_url?: string | null;
  is_mine?: boolean;
  created_at: string;
  message: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface LeagueMessagesTabProps {
  leagueId: number;
}

export default function LeagueMessagesTab({ leagueId }: LeagueMessagesTabProps) {
  const { isLeagueMember, league } = useLeague();
  const { showToast } = useToast();
  const { currentUserPlayer } = useAuth();
  
  const [messages, setMessages] = useState<LeagueMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getLeagueMessages(leagueId);
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
      showToast('Failed to load messages', 'error');
    } finally {
      setLoading(false);
    }
  }, [leagueId, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load remote messages on mount
    loadMessages();
  }, [loadMessages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
      const message = await createLeagueMessage(leagueId, newMessage.trim());
      setMessages((currentMessages) => [...currentMessages, message]);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="league-messages-tab">
      <div className="league-messages-header">
        <div className="league-messages-heading">
          <span className="league-messages-eyebrow">League messages</span>
          <h1>{league?.name ?? 'League'}</h1>
          <p>Share updates, coordinate play, and keep everyone in the loop.</p>
        </div>
        <button
          type="button"
          className="league-messages-refresh-btn"
          onClick={loadMessages}
          disabled={loading}
          aria-label="Refresh league messages"
          title="Refresh messages"
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      <div className="league-messages-list">
        {loading && messages.length === 0 ? (
          <div className="league-messages-loading" role="status">
            <RefreshCw size={22} className="spinning" aria-hidden="true" />
            <span>Loading messages…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="league-messages-empty">
            <MessageCircle size={28} aria-hidden="true" />
            <strong>No messages yet</strong>
            <span>{isLeagueMember ? 'Start the conversation with your league.' : 'Check back for league updates.'}</span>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwnMessage = msg.is_mine ?? msg.player_id === currentUserPlayer?.id;
            const playerName = msg.player_name || 'League member';

            return (
              <MessageBubble
                key={msg.id}
                message={msg.message}
                timestamp={msg.created_at}
                timeLabel={formatRelativeTime(msg.created_at)}
                isMine={isOwnMessage}
                authorName={playerName}
                authorAvatar={msg.avatar_url}
                showAuthorName
              />
            );
          })
        )}
      </div>

      {isLeagueMember && (
        <MessageComposer
          value={newMessage}
          onChange={setNewMessage}
          onSend={handleSendMessage}
          sending={sending}
          inputLabel="Message the league"
        />
      )}
    </div>
  );
}
