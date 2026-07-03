/**
 * Stats grid section for the Player Profile screen.
 * Matches wireframe: hero win-rate card + W-L, Games, ELO cards.
 *
 * When `player.game_history_visible` is false, the W-L record and Win Rate
 * tiles are replaced by a `PrivateStat` placeholder (lock icon + "Private"
 * label) so the screen never renders a fabricated "0-0" record. The ELO
 * rating and game count tiles remain visible — the backend always returns them.
 */

import React from 'react';
import { View, Text } from 'react-native';
import type { Player } from '@beach-kings/shared';
import { normalizePlayerStats } from '@beach-kings/shared';
import { LockIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface PlayerStatsGridProps {
  readonly player: Player;
}

interface StatCardProps {
  readonly value: string;
  readonly label: string;
  readonly hero?: boolean;
  readonly secondary?: boolean;
  readonly testID?: string;
}

/** Renders a single numeric stat tile. */
function StatCard({ value, label, hero = false, secondary = false, testID }: StatCardProps): React.ReactNode {
  return (
    <View
      testID={testID}
      className={`rounded-xl p-md items-center ${
        hero
          ? 'bg-brand-teal/10 col-span-2 py-lg'
          : 'bg-page'
      }`}
      style={hero ? { flex: 1 } : { width: '48%' }}
    >
      <Text
        className={`font-bold text-default ${
          hero ? 'text-[28px]' : secondary ? 'text-base text-muted' : 'text-[22px]'
        }`}
      >
        {value}
      </Text>
      <Text
        className={`text-[11px] uppercase tracking-wider mt-[3px] ${
          secondary ? 'text-tertiary' : 'text-muted'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

interface PrivateStatProps {
  /** Displayed below the lock icon as the stat category label. */
  readonly label: string;
  /** When true the tile spans the full row (matches the hero win-rate slot). */
  readonly hero?: boolean;
  readonly testID?: string;
}

/**
 * Placeholder tile shown in place of a stat that the player has chosen to
 * keep private. Uses the same layout dimensions as `StatCard` so the grid
 * shape is unchanged.
 */
function PrivateStat({ label, hero = false, testID }: PrivateStatProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View
      testID={testID}
      className={`rounded-xl p-md items-center justify-center ${
        hero ? 'bg-brand-teal/10 py-lg' : 'bg-page'
      }`}
      style={hero ? { flex: 1 } : { width: '48%' }}
    >
      <LockIcon size={hero ? 20 : 16} color={palette.textMuted} />
      <Text className="text-muted text-[11px] mt-[3px]">Private</Text>
      <Text className="text-[11px] uppercase tracking-wider mt-[3px] text-muted">
        {label}
      </Text>
    </View>
  );
}

export default function PlayerStatsGrid({ player }: PlayerStatsGridProps): React.ReactNode {
  const isHistoryVisible = player.game_history_visible !== false;
  // Nested-first, flat-fallback — see normalizePlayerStats. The public
  // profile endpoint always returns the flat shape today, but this keeps
  // the grid consistent with the other stats-consuming screens.
  const { rating, games, wins, losses } = normalizePlayerStats(player);

  // Win rate is only meaningful when win/loss history is visible. When it is,
  // the backend guarantees real wins/losses; the `wins != null` guard keeps
  // the derivation honest (and type-safe) for the hidden case, which renders
  // the PrivateStat placeholder instead of this value anyway.
  const winRate =
    isHistoryVisible && games > 0 && wins != null
      ? Math.round((wins / games) * 100)
      : 0;

  return (
    <View
      testID="player-stats-grid"
      className="bg-elevated px-lg pt-md pb-lg mt-sm"
    >
      <Text className="text-[15px] font-bold text-default mb-md">
        Stats
      </Text>

      {/* Hero win rate card — replaced by a private placeholder when history is hidden. */}
      <View className="flex-row mb-sm">
        {isHistoryVisible ? (
          <StatCard
            value={`${winRate}%`}
            label="Win Rate"
            hero
            testID="stat-win-rate"
          />
        ) : (
          <PrivateStat label="Win Rate" hero testID="stat-win-rate-private" />
        )}
      </View>

      {/* 2-column grid */}
      <View className="flex-row flex-wrap gap-sm">
        {isHistoryVisible ? (
          <StatCard
            value={`${wins ?? 0}-${losses ?? 0}`}
            label="W-L Record"
            testID="stat-record"
          />
        ) : (
          <PrivateStat label="W-L Record" testID="stat-record-private" />
        )}
        <StatCard value={String(games)} label="Games" testID="stat-games" />
        {rating != null && (
          <StatCard
            value={String(Math.round(rating))}
            label="ELO Rating"
            secondary
            testID="stat-rating"
          />
        )}
      </View>
    </View>
  );
}
