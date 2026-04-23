/**
 * Session card rendered on the Home tab for Active Sessions AND Live Tournaments.
 * Mirrors `home.html` `.session-card` (with optional green left-border accent).
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { Session } from '@beach-kings/shared';
import { routes } from '@/lib/navigation';

interface SessionCardProps {
  readonly session: Session;
  readonly badgeLabel: string;
  readonly badgeTone?: 'active' | 'league';
  readonly accentBorder?: boolean;
  readonly metaPrimary?: string;
  readonly metaSecondary?: string[];
}

export default function SessionCard({
  session,
  badgeLabel,
  badgeTone = 'active',
  accentBorder = false,
  metaPrimary,
  metaSecondary,
}: SessionCardProps): React.ReactNode {
  const router = useRouter();

  const badgeBg =
    badgeTone === 'active'
      ? 'bg-success-tint dark:bg-success-bg'
      : 'bg-teal-tint dark:bg-info-bg';
  const badgeText =
    badgeTone === 'active'
      ? 'text-success dark:text-success-text'
      : 'text-accent dark:text-info-text';

  const title = session.name ?? session.code ?? `Session #${session.id}`;
  const meta =
    metaPrimary ??
    session.league_name ??
    session.court_name ??
    'Session';

  const stats: string[] = metaSecondary ?? [
    session.match_count != null
      ? `${session.match_count} ${session.match_count === 1 ? 'game' : 'games'}`
      : '',
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => router.push(routes.session(session.id))}
      accessibilityRole="link"
      accessibilityLabel={`Session ${title}`}
      className={`bg-white dark:bg-dark-surface rounded-card p-md mb-xs shadow-sm dark:shadow-none dark:border dark:border-border-subtle ${accentBorder ? 'border-l-[3px] border-l-success' : ''}`}
    >
      <View className="flex-row justify-between items-start mb-xs">
        <Text className="text-subhead font-semibold text-text-default dark:text-content-primary flex-1 pr-sm">
          {title}
        </Text>
        <View className={`${badgeBg} px-sm py-[2px] rounded-chip`}>
          <Text className={`${badgeText} text-[10px] font-semibold`}>
            {badgeLabel}
          </Text>
        </View>
      </View>
      <Text className="text-caption text-gray-600 dark:text-content-tertiary mb-xs">
        {meta}
      </Text>
      {stats.length > 0 && (
        <View className="flex-row gap-md">
          {stats.map((s, idx) => (
            <Text
              key={idx}
              className="text-caption text-gray-700 dark:text-content-secondary"
            >
              {s}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}
