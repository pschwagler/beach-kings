import { useState, useEffect, useCallback } from 'react';
import { Send, RefreshCw } from 'lucide-react';
import { useLeague } from '../../contexts/LeagueContext';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { getLeagueMessages, createLeagueMessage } from '../../services/api';

function formatRelativeTime(dateString) {
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
  const { isLeagueMember } = useLeague();
  const { showToast } = useToast();
  const { currentUserPlayer } = useAuth();
  
  const [messages, setMessages] = useState([]);
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
    loadMessages();
  }, [loadMessages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
      const message = await createLeagueMessage(leagueId, newMessage.trim());
      setMessages([message, ...messages]);
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
        <h2>Messages</h2>
        <button 
          className="league-messages-refresh-btn"
          onClick={loadMessages}
          disabled={loading}
          title="Refresh messages"
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {isLeagueMember && (
        <form className="league-messages-form" onSubmit={handleSendMessage}>
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="league-messages-input"
            disabled={sending}
            rows={3}
          />
          <button 
            type="submit" 
            className="league-messages-send-btn"
            disabled={!newMessage.trim() || sending}
          >
            <Send size={18} />
            <span>Send</span>
          </button>
        </form>
      )}

      <div className="league-messages-list">
        {loading && messages.length === 0 ? (
          <div className="league-messages-loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="league-messages-empty">No messages yet. Be the first to post!</div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`league-message-item ${msg.player_id === currentUserPlayer?.id ? 'own-message' : ''}`}
            >
              <div className="league-message-header">
                <span className="league-message-player">{msg.player_name}</span>
                <span className="league-message-time">{formatRelativeTime(msg.created_at)}</span>
              </div>
              <div className="league-message-content">{msg.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
