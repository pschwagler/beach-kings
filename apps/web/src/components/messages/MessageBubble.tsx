import PlayerAvatar from '../player/PlayerAvatar';
import './MessageThread.css';

interface MessageBubbleProps {
  message: string;
  timestamp: string;
  timeLabel: string;
  isMine: boolean;
  authorName?: string | null;
  authorAvatar?: string | null;
  showAuthorName?: boolean;
}

export default function MessageBubble({
  message,
  timestamp,
  timeLabel,
  isMine,
  authorName,
  authorAvatar,
  showAuthorName = false,
}: MessageBubbleProps) {
  return (
    <div className={`message-thread-row message-thread-row--${isMine ? 'mine' : 'theirs'}`}>
      {!isMine && (
        <PlayerAvatar avatar={authorAvatar} name={authorName} size="small" />
      )}
      <div className="message-thread-message">
        {!isMine && showAuthorName && (
          <span className="message-thread-author">{authorName || 'Player'}</span>
        )}
        <div className={`message-thread-bubble message-thread-bubble--${isMine ? 'mine' : 'theirs'}`}>
          <p>{message}</p>
          <time dateTime={timestamp}>{timeLabel}</time>
        </div>
      </div>
    </div>
  );
}
