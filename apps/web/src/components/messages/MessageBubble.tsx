import PlayerAvatar from '../player/PlayerAvatar';
import Link from 'next/link';
import { slugify } from '../../utils/slugify';
import './MessageThread.css';

interface MessageBubbleProps {
  message: string;
  timestamp: string;
  timeLabel: string;
  isMine: boolean;
  authorName?: string | null;
  authorAvatar?: string | null;
  authorPlayerId?: number | null;
  showAuthorName?: boolean;
}

export default function MessageBubble({
  message,
  timestamp,
  timeLabel,
  isMine,
  authorName,
  authorAvatar,
  authorPlayerId,
  showAuthorName = false,
}: MessageBubbleProps) {
  const profileHref = authorPlayerId && authorPlayerId > 0
    ? `/player/${authorPlayerId}/${slugify(authorName) || 'player'}`
    : null;
  const avatar = <PlayerAvatar avatar={authorAvatar} name={authorName} size="small" />;
  return (
    <div className={`message-thread-row message-thread-row--${isMine ? 'mine' : 'theirs'}`}>
      {!isMine && (
        profileHref ? (
          <Link href={profileHref} className="message-thread-profile-link" aria-label={`View ${authorName || 'player'}'s profile`}>
            {avatar}
          </Link>
        ) : avatar
      )}
      <div className="message-thread-message">
        {!isMine && showAuthorName && (
          profileHref ? (
            <Link href={profileHref} className="message-thread-author">{authorName || 'Player'}</Link>
          ) : <span className="message-thread-author">{authorName || 'Player'}</span>
        )}
        <div className={`message-thread-bubble message-thread-bubble--${isMine ? 'mine' : 'theirs'}`}>
          <p>{message}</p>
          <time dateTime={timestamp}>{timeLabel}</time>
        </div>
      </div>
    </div>
  );
}
