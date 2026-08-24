/**
 * BreakdownTable — partners or opponents data table with toggle.
 *
 * Matches `.table-toggle` + `.data-table` in my-stats.html.
 * Columns: Name | G | W | L | W% | +/-
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View } from 'react-native';
import type { MyStatsRelationStat } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';
import type { BreakdownTab } from './useMyStatsScreen';
import SegmentControl from '@/components/ui/SegmentControl';

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

interface ToggleProps {
  readonly tab: BreakdownTab;
  readonly onTabChange: (tab: BreakdownTab) => void;
}

function TableToggle({ tab, onTabChange }: ToggleProps): React.ReactNode {
  return (
    <SegmentControl
      testID="breakdown-toggle"
      className="mb-sm"
      compact
      value={tab}
      onValueChange={onTabChange}
      items={[
        { value: 'partners', label: 'Partners', testID: 'toggle-partners' },
        { value: 'opponents', label: 'Opponents', testID: 'toggle-opponents' },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------

interface RowProps {
  readonly row: MyStatsRelationStat;
}

function DataRow({ row }: RowProps): React.ReactNode {
  const fullName = row.full_name?.trim();
  const fallbackName = row.display_name.trim();
  const name = fullName || fallbackName || `Player ${row.player_id}`;

  return (
    <View
      testID={`breakdown-row-${row.player_id}`}
      className="flex-row items-center px-[14px] py-[11px] border-b border-divider last:border-b-0"
    >
      {/* Avatar initials + name */}
      <View className="flex-1 min-w-0 flex-row items-center gap-2 pr-xs">
        <Avatar
          imageUrl={row.avatar_url}
          name={name}
          size={28}
          colorSeed={row.player_id}
          accessible={false}
        />
        <AppText
          testID={`breakdown-name-${row.player_id}`}
          className="flex-1 min-w-0 text-[13px] font-bold text-default"
          numberOfLines={1}
          ellipsizeMode="tail"
          accessibilityLabel={name}
        >
          {name}
        </AppText>
      </View>

      {/* G */}
      <AppText className="w-[36px] text-center text-[12px] text-muted">
        {row.games_played}
      </AppText>

      {/* W-L */}
      <AppText className="w-[44px] text-center text-[12px] text-muted">
        {row.wins}-{row.losses}
      </AppText>

      {/* W% */}
      <AppText className="w-[40px] text-center text-[12px] text-muted">
        {row.win_rate}%
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------

interface BreakdownTableProps {
  readonly tab: BreakdownTab;
  readonly partners: readonly MyStatsRelationStat[];
  readonly opponents: readonly MyStatsRelationStat[];
  readonly onTabChange: (tab: BreakdownTab) => void;
}

export default function BreakdownTable({
  tab,
  partners,
  opponents,
  onTabChange,
}: BreakdownTableProps): React.ReactNode {
  const rows = tab === 'partners' ? partners : opponents;

  return (
    <View testID="breakdown-table">
      <TableToggle tab={tab} onTabChange={onTabChange} />

      {rows.length === 0 ? (
        <AppText className="text-[13px] text-muted italic py-4 text-center">
          No data for this period.
        </AppText>
      ) : (
        <View className="bg-surface rounded-[12px] border border-divider overflow-hidden">
          {/* Header */}
          <View className="flex-row px-[14px] py-[10px] bg-page">
            <AppText className="flex-1 text-[11px] font-bold text-muted uppercase tracking-wider">
              Name
            </AppText>
            <AppText className="w-[36px] text-center text-[11px] font-bold text-muted uppercase tracking-wider">
              G
            </AppText>
            <AppText className="w-[44px] text-center text-[11px] font-bold text-muted uppercase tracking-wider">
              W-L
            </AppText>
            <AppText className="w-[40px] text-center text-[11px] font-bold text-muted uppercase tracking-wider">
              W%
            </AppText>
          </View>

          {/* Rows */}
          {rows.map((row) => (
            <DataRow key={row.player_id} row={row} />
          ))}
        </View>
      )}
    </View>
  );
}
