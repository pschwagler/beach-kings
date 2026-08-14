import { getPlayerImageUrl } from '../../utils/avatar';
import './PlayerAvatar.css';

interface PlayerAvatarProps {
  avatar?: string | null;
  name?: string | null;
  size?: 'small' | 'medium';
  className?: string;
}

function getInitials(name: string | null | undefined): string {
  if (!name?.trim()) return '?';

  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].charAt(0).toUpperCase()
    : `${parts[0].charAt(0)}${parts.at(-1)?.charAt(0) ?? ''}`.toUpperCase();
}

export default function PlayerAvatar({
  avatar,
  name,
  size = 'medium',
  className = '',
}: PlayerAvatarProps) {
  const imageUrl = getPlayerImageUrl({ avatar });
  const classes = ['player-avatar-component', `player-avatar-component--${size}`, className]
    .filter(Boolean)
    .join(' ');

  if (imageUrl) {
    return (
      <span className={classes}>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated avatar URLs are dynamic */}
        <img src={imageUrl} alt={`${name || 'Player'} avatar`} loading="lazy" decoding="async" />
      </span>
    );
  }

  return (
    <span className={classes} aria-label={`${name || 'Player'} avatar`}>
      {avatar || getInitials(name)}
    </span>
  );
}
