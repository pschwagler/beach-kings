import React, { useRef } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import type { LeagueStanding } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import Avatar from '@/components/ui/Avatar';
import { hapticLight } from '@/utils/haptics';

type SortField = 'rank' | 'name' | 'wins' | 'win_rate' | 'rating';
type SortDir = 'asc' | 'desc';

interface Props {
  readonly standings: readonly LeagueStanding[];
  readonly isSeasonView: boolean;
  readonly sortField: SortField | null;
  readonly sortDir: SortDir;
  readonly onSort: (field: SortField) => void;
  readonly onPressPlayer: (playerId: number) => void;
}

interface HeaderProps {
  readonly field: SortField;
  readonly label: string;
  readonly testID: string;
  readonly width: number;
  readonly sortField: SortField | null;
  readonly sortDir: SortDir;
  readonly onSort: (field: SortField) => void;
}

function SortHeader({ field, label, testID, width, sortField, sortDir, onSort }: HeaderProps) {
  const selected = sortField === field;
  return (
    <Pressable
      testID={testID}
      style={{ width }}
      onPress={() => onSort(field)}
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${label}`}
      accessibilityState={{ selected }}
      accessibilityHint={selected
        ? `Currently sorted ${sortDir === 'desc' ? 'descending' : 'ascending'}. Tap to reverse.`
        : 'Tap to sort by this column.'}
      className="h-full flex-row items-center justify-center px-1 active:opacity-70"
    >
      <AppText className={`text-[12px] font-semibold ${selected ? 'text-default' : 'text-muted'}`}>
        {label}{selected ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
      </AppText>
    </Pressable>
  );
}

function PlayerCell({ standing, height, onPressPlayer }: {
  standing: LeagueStanding;
  height: number;
  onPressPlayer: Props['onPressPlayer'];
}) {
  const start = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  return (
    <View
      testID={`standings-row-${standing.player_id}`}
      style={{ height }}
      className="border-b border-divider bg-surface"
    >
      <Pressable
        testID={`standings-player-${standing.player_id}`}
        accessibilityRole="button"
        accessibilityLabel={`View ${standing.display_name}, rank ${standing.rank}`}
        onPressIn={(event) => {
          start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
          moved.current = false;
        }}
        onTouchMove={(event) => {
          if (Math.abs(event.nativeEvent.pageX - start.current.x) > 8
            || Math.abs(event.nativeEvent.pageY - start.current.y) > 8) moved.current = true;
        }}
        onPress={() => {
          if (moved.current) return;
          void hapticLight();
          onPressPlayer(standing.player_id);
        }}
        className="flex-1 flex-row items-center gap-2 px-2 active:opacity-70"
      >
        <Avatar imageUrl={standing.avatar_url} name={standing.display_name}
          size="sm" colorSeed={standing.player_id} accessible={false} />
        <View className="flex-1">
          <AppText numberOfLines={1} className="text-[13px] font-semibold text-default">
            {standing.display_name}
          </AppText>
          <AppText className="text-[11px] text-muted">#{standing.rank}</AppText>
        </View>
      </Pressable>
    </View>
  );
}

function Metric({ value, width = 76, testID }: { value: string | number; width?: number; testID?: string }) {
  return (
    <View testID={testID} style={{ width }} className="items-center justify-center px-1">
      <AppText className="text-[13px] text-default text-center">{value}</AppText>
    </View>
  );
}

/** Player identity stays fixed while the entire metric grid scrolls together. */
export default function LeagueStandingsTable(props: Props): React.ReactNode {
  const { standings, isSeasonView, onPressPlayer } = props;
  const { width, fontScale } = useWindowDimensions();
  const rowHeight = Math.ceil(64 * Math.max(1, fontScale));
  const headerHeight = Math.ceil(44 * Math.max(1, fontScale));
  const playerWidth = Math.min(184, Math.round((width - 32) * 0.48));
  const headerProps = { sortField: props.sortField, sortDir: props.sortDir, onSort: props.onSort };
  return (
    <>
      <AppText className="px-3 py-2 text-[11px] text-muted">
        Swipe stats for more · Tap a player for details
      </AppText>
      <View className="flex-row">
        <View testID="standings-player-column" style={{ width: playerWidth }}
          className="border-r border-divider">
          <View style={{ height: headerHeight }} className="flex-row bg-elevated border-b border-divider">
            <SortHeader {...headerProps} testID="sort-by-rank" field="rank" label="#" width={40} />
            <SortHeader {...headerProps} testID="sort-by-name" field="name" label="Player" width={playerWidth - 40} />
          </View>
          {standings.map((standing) => (
            <PlayerCell key={standing.player_id} standing={standing} height={rowHeight} onPressPlayer={onPressPlayer} />
          ))}
        </View>
        <ScrollView testID="standings-metrics-scroll" horizontal directionalLockEnabled
          showsHorizontalScrollIndicator className="flex-1">
          <View>
            <View style={{ height: headerHeight }} className="flex-row bg-elevated border-b border-divider">
              <SortHeader {...headerProps} testID="sort-by-wins" field="wins" label="W-L" width={76} />
              <SortHeader {...headerProps} testID="sort-by-win-rate" field="win_rate" label="Win%" width={76} />
              <SortHeader {...headerProps} testID="sort-by-rating" field="rating" label={isSeasonView ? 'PTS' : 'Rating'} width={84} />
              <View style={{ width: 76 }} className="items-center justify-center">
                <AppText className="text-[12px] font-semibold text-muted">Games</AppText>
              </View>
              {!isSeasonView && (
                <View style={{ width: 84 }} className="items-center justify-center">
                  <AppText className="text-[12px] font-semibold text-muted">Change</AppText>
                </View>
              )}
              {isSeasonView && (
                <View testID="standings-global-rating-header" style={{ width: 112 }} className="items-center justify-center px-1">
                  <AppText className="text-[12px] font-semibold text-muted text-center">Global rating</AppText>
                </View>
              )}
            </View>
            {standings.map((standing) => (
              <View key={standing.player_id} testID={`standings-metrics-${standing.player_id}`}
                accessible
                accessibilityLabel={`${standing.display_name}: ${standing.wins} wins, ${standing.losses} losses, ${standing.win_rate}% win rate, ${isSeasonView ? 'points' : 'rating'} ${standing.rating != null ? Math.round(standing.rating) : 'unavailable'}, ${standing.games_played} games${!isSeasonView && standing.rating_delta != null ? `, rating change ${Math.round(standing.rating_delta)}` : ''}${isSeasonView ? `, global rating ${standing.global_rating != null ? Math.round(standing.global_rating) : 'unavailable'}` : ''}`}
                style={{ height: rowHeight }} className="flex-row bg-surface border-b border-divider">
                <Metric value={`${standing.wins}-${standing.losses}`} />
                <Metric value={`${standing.win_rate}%`} />
                <Metric value={standing.rating != null ? Math.round(standing.rating) : '—'} width={84} />
                <Metric value={standing.games_played} />
                {!isSeasonView && <Metric width={84} value={standing.rating_delta != null
                  ? `${standing.rating_delta >= 0 ? '+' : ''}${Math.round(standing.rating_delta)}` : '—'} />}
                {isSeasonView && <Metric testID={`standings-global-rating-${standing.player_id}`} width={112}
                  value={standing.global_rating != null ? Math.round(standing.global_rating) : '—'} />}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </>
  );
}
