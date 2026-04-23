/**
 * BreakdownTable — partners or opponents data table with toggle.
 *
 * Matches `.table-toggle` + `.data-table` in my-stats.html.
 * Columns: Name | G | W | L | W% | +/-
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { PartnerOpponentRow } from '@/lib/mockApi';
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
    <View className="flex-row bg-gray-100 dark:bg-dark-surface rounded-[8px] p-[2px] mb-[10px]">
      {(['partners', 'opponents'] as const).map((t) => (
        <Pressable
          key={t}
          testID={`toggle-${t}`}
          onPress={() => onTabChange(t)}
          accessibilityRole="button"
          accessibilityLabel={t === 'partners' ? 'Partners' : 'Opponents'}
          className={`flex-1 items-center py-2 rounded-[6px] ${
            tab === t
              ? 'bg-white dark:bg-dark-card shadow-sm'
              : ''
          }`}
        >
          <Text
            className={`text-[12px] font-bold ${
              tab === t
                ? 'text-text-default dark:text-content-primary'
                : 'text-text-muted dark:text-content-tertiary'
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
  readonly row: PartnerOpponentRow;
}

function DataRow({ row }: RowProps): React.ReactNode {
  const ratingDeltaUp = row.rating_diff >= 0;
  return (
    <View className="flex-row items-center px-[14px] py-[11px] border-b border-gray-100 dark:border-border-subtle last:border-b-0">
      {/* Avatar initials + name */}
      <View className="flex-1 flex-row items-center gap-2">
        <View className="w-7 h-7 rounded-full bg-teal-100 dark:bg-info-bg items-center justify-center">
          <Text className="text-[11px] font-bold text-accent dark:text-brand-teal">
            {row.initials}
          </Text>
        </View>
        <Text className="text-[13px] font-bold text-text-default dark:text-content-primary">
          {row.display_name}
        </Text>
      </View>

      {/* G */}
      <Text className="w-[36px] text-center text-[12px] text-text-muted dark:text-content-tertiary">
        {row.games_played}
      </Text>

      {/* W-L */}
      <Text className="w-[44px] text-center text-[12px] text-text-muted dark:text-content-secondary">
        {row.wins}-{row.losses}
      </Text>

      {/* W% */}
      <Text className="w-[40px] text-center text-[12px] text-text-muted dark:text-content-secondary">
        {row.win_rate}%
      </Text>

      {/* +/- */}
      <Text
        className={`w-[36px] text-center text-[11px] font-bold ${
          ratingDeltaUp
            ? 'text-green-700 dark:text-green-400'
            : 'text-red-700 dark:text-red-400'
        }`}
      >
        {ratingDeltaUp ? '+' : ''}
        {row.rating_diff}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------

interface BreakdownTableProps {
  readonly tab: BreakdownTab;
  readonly partners: readonly PartnerOpponentRow[];
  readonly opponents: readonly PartnerOpponentRow[];
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
        <Text className="text-[13px] text-text-muted dark:text-content-tertiary italic py-4 text-center">
          No data for this period.
        </Text>
      ) : (
        <View className="bg-white dark:bg-dark-surface rounded-[12px] shadow-sm dark:shadow-none dark:border dark:border-border-subtle overflow-hidden">
          {/* Header */}
          <View className="flex-row px-[14px] py-[10px] bg-gray-50 dark:bg-dark-card">
            <Text className="flex-1 text-[11px] font-bold text-text-muted dark:text-content-tertiary uppercase tracking-wider">
              Name
            </Text>
            <Text className="w-[36px] text-center text-[11px] font-bold text-text-muted dark:text-content-tertiary uppercase tracking-wider">
              G
            </Text>
            <Text className="w-[44px] text-center text-[11px] font-bold text-text-muted dark:text-content-tertiary uppercase tracking-wider">
              W-L
            </Text>
            <Text className="w-[40px] text-center text-[11px] font-bold text-text-muted dark:text-content-tertiary uppercase tracking-wider">
              W%
            </Text>
            <Text className="w-[36px] text-center text-[11px] font-bold text-text-muted dark:text-content-tertiary uppercase tracking-wider">
              +/-
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
