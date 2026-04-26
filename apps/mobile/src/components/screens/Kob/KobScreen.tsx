/**
 * KobScreen — King of the Beach tournament orchestrator.
 *
 * Renders:
 *   - Tournament header: name, status badge, current round label
 *   - TabView: Live | Schedule | Standings
 *   - Panel for the active tab (shared data — no refetch on tab switch)
 *   - Skeleton while loading
 *   - Error state with retry
 *   - Pull-to-refresh on the active panel
 *
 * Wireframe ref: kob-live.html, kob-schedule.html, kob-standings.html
 */

import React, { useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import TabView from '@/components/ui/TabView';
import { useKobScreen, KOB_TABS } from './useKobScreen';
import KobLivePanel from './KobLivePanel';
import KobSchedulePanel from './KobSchedulePanel';
import KobStandingsPanel from './KobStandingsPanel';
import KobSkeleton from './KobSkeleton';
import KobErrorState from './KobErrorState';
import { hapticLight } from '@/utils/haptics';

// ---------------------------------------------------------------------------
// Tournament header
// ---------------------------------------------------------------------------

function TournamentHeader({
  name,
  status,
  currentRound,
  maxRounds,
}: {
  name: string;
  status: string;
  currentRound: number | null;
  maxRounds: number | null;
}): React.ReactNode {
  const isActive = status === 'active';
  const isCompleted = status === 'completed';

  const statusLabel = isActive
    ? 'Active'
    : isCompleted
      ? 'Completed'
      : 'Upcoming';

  const statusClass = isActive
    ? 'bg-info-tint border-brand-teal text-brand-teal'
    : isCompleted
      ? 'bg-elevated border-strong text-muted'
      : 'bg-warning-tint border-warning text-warning';

  return (
    <View
      testID="kob-tournament-header"
      className="px-4 py-4 border-b border-strong"
    >
      <Text className="text-[20px] font-bold text-default mb-2">
        {name}
      </Text>

      <View className="flex-row items-center gap-3">
        <View
          className={`px-3 py-1 rounded-full border ${statusClass}`}
        >
          <Text className={`text-[12px] font-semibold ${statusClass.split(' ').slice(-2).join(' ')}`}>
            {statusLabel}
          </Text>
        </View>

        {currentRound != null && maxRounds != null && isActive && (
          <Text className="text-[13px] text-muted">
            Round {currentRound} of {maxRounds}
          </Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface KobScreenProps {
  readonly code: string | number;
  readonly currentPlayerId?: number | null;
}

export default function KobScreen({
  code,
  currentPlayerId = null,
}: KobScreenProps): React.ReactNode {
  const {
    tournament,
    isLoading,
    error,
    isRefreshing,
    activeTabIndex,
    onTabPress,
    onRefresh,
    onRetry,
  } = useKobScreen(code);

  const handleTabPress = useCallback(
    (index: number) => {
      void hapticLight();
      onTabPress(index);
    },
    [onTabPress],
  );

  // --- Loading skeleton ---
  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="kob-screen"
      >
        <TopNav title="King of the Beach" showBack />
        <KobSkeleton />
      </SafeAreaView>
    );
  }

  // --- Error ---
  if (error != null || tournament == null) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
        testID="kob-screen"
      >
        <TopNav title="King of the Beach" showBack />
        <KobErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  const renderPanel = () => {
    switch (activeTabIndex) {
      case 0:
        return <KobLivePanel tournament={tournament} />;
      case 1:
        return <KobSchedulePanel tournament={tournament} />;
      case 2:
        return (
          <KobStandingsPanel
            tournament={tournament}
            currentPlayerId={currentPlayerId}
          />
        );
      default:
        return <KobLivePanel tournament={tournament} />;
    }
  };

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="kob-screen"
    >
      <TopNav title="King of the Beach" showBack />

      <TournamentHeader
        name={tournament.name}
        status={tournament.status}
        currentRound={tournament.current_round ?? null}
        maxRounds={tournament.max_rounds ?? null}
      />

      <TabView
        tabs={KOB_TABS}
        activeIndex={activeTabIndex}
        onTabPress={handleTabPress}
      />

      <View
        className="flex-1"
        testID="kob-panel-container"
        {...({
          refreshControl: (
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          ),
        } as object)}
      >
        {renderPanel()}
      </View>
    </SafeAreaView>
  );
}
