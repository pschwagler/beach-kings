/**
 * BreakdownTable — partners or opponents data table with toggle.
 *
 * Matches `.table-toggle` + `.data-table` in my-stats.html.
 * Columns: Name | G | W | L | W% | +/-
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import type { MyStatsRelationStat } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';
import type { BreakdownTab } from './useMyStatsScreen';

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

interface ToggleProps {
  readonly tab: BreakdownTab;
  readonly onTabChange: (tab: BreakdownTab) => void;
}

function TableToggle({ tab, onTabChange }: ToggleProps): React.ReactNode {
  return (
    <View className="flex-row bg-elevated rounded-[8px] p-[2px] mb-[10px]">
      {(['partners', 'opponents'] as const).map((t) => (
        <Pressable
          key={t}
          testID={`toggle-${t}`}
          onPress={() => onTabChange(t)}
          accessibilityRole="button"
          accessibilityLabel={t === 'partners' ? 'Partners' : 'Opponents'}
          className={`flex-1 items-center py-2 rounded-[6px] ${
            tab === t
              ? 'bg-surface'
              : ''
          }`}
        >
          <AppText
            className={`text-[12px] font-bold ${
              tab === t
                ? 'text-default'
                : 'text-muted'
            }`}
          >
            {t === 'partners' ? 'Partners' : 'Opponents'}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------

interface RowProps {
  readonly row: MyStatsRelationStat;
}

function DataRow({ row }: RowProps): React.ReactNode {
  return (
    <View className="flex-row items-center px-[14px] py-[11px] border-b border-divider last:border-b-0">
      {/* Avatar initials + name */}
      <View className="flex-1 flex-row items-center gap-2">
        <Avatar
          imageUrl={row.avatar_url}
          name={row.display_name}
          size={28}
          colorSeed={row.player_id}
          accessible={false}
        />
        <AppText className="text-[13px] font-bold text-default">
          {row.display_name}
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
