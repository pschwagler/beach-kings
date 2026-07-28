/**
 * BreakdownTable — partners or opponents data table with toggle.
 *
 * Matches `.table-toggle` + `.data-table` in my-stats.html.
 * Columns: Name | G | W | L | W% | +/-
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
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

// Shadow for the active segment as a plain RN style, NOT a `shadow-sm` class:
// toggling a shadow-* class between renders crashes NativeWind v4's css
// interop (nativewind 4.1.23 / react-native-css-interop 0.2.3) with a
// misleading "Couldn't find a navigation context" render error. Values match
// the `shadow-sm` token. Black shadow color is universal, not themed.
const ACTIVE_SEGMENT_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
} as const;

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
          style={tab === t ? ACTIVE_SEGMENT_SHADOW : undefined}
        >
          <Text
            className={`text-[12px] font-bold ${
              tab === t
                ? 'text-default'
                : 'text-muted'
            }`}
          >
            {t === 'partners' ? 'Partners' : 'Opponents'}
          </Text>
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
        <Text className="text-[13px] font-bold text-default">
          {row.display_name}
        </Text>
      </View>

      {/* G */}
      <Text className="w-[36px] text-center text-[12px] text-muted">
        {row.games_played}
      </Text>

      {/* W-L */}
      <Text className="w-[44px] text-center text-[12px] text-muted">
        {row.wins}-{row.losses}
      </Text>

      {/* W% */}
      <Text className="w-[40px] text-center text-[12px] text-muted">
        {row.win_rate}%
      </Text>
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
        <Text className="text-[13px] text-muted italic py-4 text-center">
          No data for this period.
        </Text>
      ) : (
        <View className="bg-surface rounded-[12px] shadow-sm dark:shadow-none dark:border border-divider overflow-hidden">
          {/* Header */}
          <View className="flex-row px-[14px] py-[10px] bg-page">
            <Text className="flex-1 text-[11px] font-bold text-muted uppercase tracking-wider">
              Name
            </Text>
            <Text className="w-[36px] text-center text-[11px] font-bold text-muted uppercase tracking-wider">
              G
            </Text>
            <Text className="w-[44px] text-center text-[11px] font-bold text-muted uppercase tracking-wider">
              W-L
            </Text>
            <Text className="w-[40px] text-center text-[11px] font-bold text-muted uppercase tracking-wider">
              W%
            </Text>
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
