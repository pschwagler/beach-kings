/**
 * GamesFilterBar — horizontal filter chips for the My Games screen.
 *
 * Primary row: All Results | Wins | Losses | Partner | Opponent
 *
 * When "Partner" or "Opponent" is active, a secondary chip row appears
 * listing each unique name from the loaded games for sub-selection.
 * Sub-selection filtering is handled client-side in useMyGamesScreen.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Pressable,
  Text,
  ScrollView,
  useColorScheme,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { ChevronRightIcon } from '@/components/ui/icons';
import type { ResultFilter } from './useMyGamesScreen';

interface FilterChipProps {
  readonly label: string;
  readonly isActive: boolean;
  readonly testID?: string;
  readonly onPress: () => void;
}

function FilterChip({ label, isActive, testID, onPress }: FilterChipProps): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexShrink: 0 }}
      className={`px-3 py-[9px] rounded-[8px] border mr-2 ${
        isActive
          ? 'bg-navy dark:bg-content-primary border-navy dark:border-content-primary'
          : 'bg-white dark:bg-dark-surface border-gray-200 dark:border-border-subtle'
      }`}
    >
      <Text
        numberOfLines={1}
        className={`text-[12px] font-semibold ${
          isActive ? 'text-white' : 'text-text-muted dark:text-content-secondary'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const RESULT_OPTIONS: { label: string; value: ResultFilter }[] = [
  { label: 'All Results', value: 'all' },
  { label: 'Wins', value: 'W' },
  { label: 'Losses', value: 'L' },
  { label: 'Partner', value: 'partner' },
  { label: 'Opponent', value: 'opponent' },
];

interface GamesFilterBarProps {
  readonly resultFilter: ResultFilter;
  readonly onResultChange: (r: ResultFilter) => void;
  readonly leagueFilter: number | null;
  readonly onLeagueClear: () => void;
  readonly activeLeagueName?: string | null;
  readonly availablePartners: readonly string[];
  readonly availableOpponents: readonly string[];
  readonly selectedPartner: string | null;
  readonly selectedOpponent: string | null;
  readonly onPartnerSelect: (name: string | null) => void;
  readonly onOpponentSelect: (name: string | null) => void;
}

export default function GamesFilterBar({
  resultFilter,
  onResultChange,
  leagueFilter,
  onLeagueClear,
  activeLeagueName,
  availablePartners,
  availableOpponents,
  selectedPartner,
  selectedOpponent,
  onPartnerSelect,
  onOpponentSelect,
}: GamesFilterBarProps): React.ReactNode {
  const showPartnerRow = resultFilter === 'partner' && availablePartners.length > 0;
  const showOpponentRow = resultFilter === 'opponent' && availableOpponents.length > 0;

  const isDark = useColorScheme() === 'dark';
  const surfaceColor = isDark ? '#161b22' : '#ffffff';

  // Scroll affordance: show a right-edge fade when primary row has off-screen chips
  const [showRightFade, setShowRightFade] = useState(false);
  const contentW = useRef(0);
  const containerW = useRef(0);

  const updateFade = (scrollX: number) => {
    setShowRightFade(contentW.current - containerW.current - scrollX > 8);
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    containerW.current = e.nativeEvent.layout.width;
    updateFade(0);
  };

  const handleContentSizeChange = (w: number) => {
    contentW.current = w;
    updateFade(0);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateFade(e.nativeEvent.contentOffset.x);
  };

  return (
    <View
      testID="games-filter-bar"
      className="bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-border-subtle"
    >
      {/* Primary filter row with scroll-affordance overlay */}
      <View style={{ overflow: 'hidden' }} onLayout={handleLayout}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
        >
          {leagueFilter != null && (
            <FilterChip
              testID="filter-league-active"
              label={activeLeagueName ?? `League #${leagueFilter} ×`}
              isActive
              onPress={onLeagueClear}
            />
          )}
          {RESULT_OPTIONS.map(({ label, value }) => (
            <FilterChip
              key={value}
              testID={`filter-result-${value}`}
              label={label}
              isActive={resultFilter === value}
              onPress={() => onResultChange(value)}
            />
          ))}
        </ScrollView>

        {showRightFade && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 48,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: 6,
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                right: 0,
                flexDirection: 'row',
              }}
            >
              <View style={{ flex: 1, backgroundColor: `${surfaceColor}00` }} />
              <View style={{ flex: 1, backgroundColor: `${surfaceColor}88` }} />
              <View style={{ flex: 1, backgroundColor: `${surfaceColor}dd` }} />
            </View>
            <ChevronRightIcon size={14} color={isDark ? '#666' : '#bbb'} />
          </View>
        )}
      </View>

      {showPartnerRow && (
        <View
          testID="partner-filter-row"
          className="border-t border-gray-100 dark:border-border-subtle"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}
          >
            <FilterChip
              label="All Partners"
              isActive={selectedPartner == null}
              onPress={() => onPartnerSelect(null)}
            />
            {availablePartners.map((name) => (
              <FilterChip
                key={name}
                label={name}
                isActive={selectedPartner === name}
                onPress={() => onPartnerSelect(selectedPartner === name ? null : name)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {showOpponentRow && (
        <View
          testID="opponent-filter-row"
          className="border-t border-gray-100 dark:border-border-subtle"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}
          >
            <FilterChip
              label="All Opponents"
              isActive={selectedOpponent == null}
              onPress={() => onOpponentSelect(null)}
            />
            {availableOpponents.map((name) => (
              <FilterChip
                key={name}
                label={name}
                isActive={selectedOpponent === name}
                onPress={() => onOpponentSelect(selectedOpponent === name ? null : name)}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
