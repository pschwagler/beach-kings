/**
 * LeagueDetailScreen — Main orchestrator for the League Detail view.
 *
 * Shows:
 *   Compact league header: name, location, member count
 *   5-tab segment: Games | Standings | Chat | Sign Ups | Info
 *
 * The Add Game action lives in TopNav. Each tab renders a dedicated component.
 * The Standings tab also supports tapping a player row to push LeagueStatsTab
 * as a sub-view.
 *
 * Wireframe ref: league-detail.html
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import BottomTabBar, { BottomTabBarHeightContext } from '@/components/navigation/BottomTabBar';
import { hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { useLeagueDetailScreen, type LeagueDetailTab } from './useLeagueDetailScreen';
import LeagueDashboardTab from './LeagueDashboardTab';
import LeagueChatTab from './LeagueChatTab';
import LeagueSignupsTab from './LeagueSignupsTab';
import LeagueInfoTab from './LeagueInfoTab';
import LeagueMatchesTab from './LeagueMatchesTab';
import LeagueStatsTab from './LeagueStatsTab';

// ---------------------------------------------------------------------------
// Tab definition
// ---------------------------------------------------------------------------

const TABS: { key: LeagueDetailTab; label: string }[] = [
  { key: 'games', label: 'Games' },
  { key: 'standings', label: 'Standings' },
  { key: 'chat', label: 'Chat' },
  { key: 'signups', label: 'Sign Ups' },
  { key: 'info', label: 'Info' },
];

// ---------------------------------------------------------------------------
// Segment bar
// ---------------------------------------------------------------------------

interface SegmentBarProps {
  readonly tabs: readonly { key: LeagueDetailTab; label: string }[];
  readonly activeTab: LeagueDetailTab;
  readonly onSetTab: (tab: LeagueDetailTab) => void;
}

function SegmentBar({ tabs, activeTab, onSetTab }: SegmentBarProps): React.ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="league-segment-bar"
      className="bg-surface border-b border-divider grow-0 shrink-0"
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ paddingHorizontal: 8, alignItems: 'center' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            testID={`segment-tab-${tab.key}`}
            onPress={() => {
              void hapticLight();
              onSetTab(tab.key);
            }}
            className="px-4 py-[12px] mr-1"
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive
                  ? 'text-brand-teal'
                  : 'text-muted'
              }`}
            >
              {tab.label}
            </Text>
            {isActive && (
              <View className="absolute bottom-0 left-4 right-4 h-[2px] bg-brand-teal rounded-full" />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// League header
// ---------------------------------------------------------------------------

interface LeagueHeaderProps {
  readonly name: string;
  readonly locationName: string | null;
  readonly memberCount: number;
}

function LeagueHeader({
  name,
  locationName,
  memberCount,
}: LeagueHeaderProps): React.ReactNode {
  return (
    <View
      testID="league-header"
      className="bg-surface px-4 pt-3 pb-3 border-b border-divider"
    >
      <Text
        testID="league-header-name"
        className="text-[20px] font-extrabold text-default"
        numberOfLines={1}
      >
        {name}
      </Text>

      <View className="flex-row flex-wrap items-center gap-x-2 mt-[2px]">
        {locationName != null && (
          <Text className="text-[12px] text-muted">{locationName}</Text>
        )}
        {locationName != null && (
          <Text className="text-[12px] text-muted">·</Text>
        )}
        <Text className="text-[12px] text-muted">{memberCount} members</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab content renderer
// ---------------------------------------------------------------------------

interface TabContentProps {
  readonly leagueId: number | string;
  readonly userRole: 'admin' | 'member' | null;
  readonly activeTab: LeagueDetailTab;
  readonly statsPlayerId: number | string | null;
  readonly onViewPlayerStats: (id: number | string) => void;
}

function TabContent({
  leagueId,
  userRole,
  activeTab,
  statsPlayerId,
  onViewPlayerStats,
}: TabContentProps): React.ReactNode {
  // Stats sub-view is pushed from standings tab
  if (activeTab === 'standings' && statsPlayerId != null) {
    return (
      <LeagueStatsTab
        leagueId={leagueId}
        playerId={statsPlayerId}
      />
    );
  }

  switch (activeTab) {
    case 'games':
      return <LeagueMatchesTab leagueId={leagueId} />;
    case 'standings':
      return (
        <LeagueDashboardTab
          leagueId={leagueId}
          onPressPlayer={(id) => onViewPlayerStats(id)}
        />
      );
    case 'chat':
      return <LeagueChatTab leagueId={leagueId} />;
    case 'signups':
      return <LeagueSignupsTab leagueId={leagueId} />;
    case 'info':
      return <LeagueInfoTab leagueId={leagueId} userRole={userRole} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

interface LeagueDetailScreenProps {
  readonly leagueId?: number | string;
}

export default function LeagueDetailScreen({
  leagueId: leagueIdProp,
}: LeagueDetailScreenProps): React.ReactNode {
  const params = useLocalSearchParams<{ id: string }>();
  const resolvedId = leagueIdProp ?? params.id ?? '1';
  const router = useRouter();

  const {
    detail,
    isLoading,
    isError,
    activeTab,
    onSetTab,
    onPressPlayer,
  } = useLeagueDetailScreen(resolvedId);

  // Track which player row was tapped in standings to push stats sub-view
  const [statsPlayerId, setStatsPlayerId] = useState<number | string | null>(null);

  // Measured at runtime so LeagueChatTab can align its composer to the keyboard
  // top precisely (avoids hardcoded estimate drift across devices / iOS versions).
  const [tabBarHeight, setTabBarHeight] = useState(0);

  const handlePressPlayer = (id: number | string): void => {
    if (activeTab === 'standings') {
      setStatsPlayerId(id);
    } else {
      onPressPlayer(id);
    }
  };

  const handleSetTab = (tab: LeagueDetailTab): void => {
    // Always clear the stats sub-view on tab switch — including re-tapping
    // Standings, which should drop the user back to the standings list.
    setStatsPlayerId(null);
    onSetTab(tab);
  };

  const title = detail?.name != null && detail.name.trim().length > 0 ? detail.name : 'League';
  const canAddGame =
    detail != null && (detail.user_role === 'admin' || detail.user_role === 'member');

  const addGameAction = canAddGame ? (
    <Pressable
      testID="league-add-game-btn"
      onPress={() => {
        void hapticLight();
        router.push(
          routes.scoreGame({
            leagueId: Number(resolvedId),
            seasonId: detail?.current_season_id ?? null,
            headerTitle: 'Add Game',
            sessionLabel: detail?.name,
          }) as never,
        );
      }}
      accessibilityRole="button"
      accessibilityLabel="Add game"
      className="min-h-touch items-center justify-center px-2 active:opacity-70"
    >
      <Text className="text-[14px] font-semibold text-white">+ Add Game</Text>
    </Pressable>
  ) : undefined;

  const measuredTabBar = (
    <View onLayout={(e) => setTabBarHeight(e.nativeEvent.layout.height)}>
      <BottomTabBar active="leagues" />
    </View>
  );

  if (isLoading) {
    return (
      <BottomTabBarHeightContext.Provider value={tabBarHeight}>
        <SafeAreaView
          className="flex-1 bg-page"
          edges={['top']}
        >
          <TopNav title="League" showBack backFallback={routes.leagues()} />
          <View testID="league-detail-loading" className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
          </View>
          {measuredTabBar}
        </SafeAreaView>
      </BottomTabBarHeightContext.Provider>
    );
  }

  if (isError || detail == null) {
    return (
      <BottomTabBarHeightContext.Provider value={tabBarHeight}>
        <SafeAreaView
          className="flex-1 bg-page"
          edges={['top']}
        >
          <TopNav title="League" showBack backFallback={routes.leagues()} />
          <View
            testID="league-detail-error"
            className="flex-1 items-center justify-center px-8"
          >
            <Text className="text-[16px] font-bold text-default text-center">
              Failed to load league
            </Text>
          </View>
          {measuredTabBar}
        </SafeAreaView>
      </BottomTabBarHeightContext.Provider>
    );
  }

  return (
    <BottomTabBarHeightContext.Provider value={tabBarHeight}>
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top']}
      >
        <TopNav title={title} showBack backFallback={routes.leagues()} rightAction={addGameAction} />
        <View testID="league-detail-screen" className="flex-1 bg-page">
          <LeagueHeader
            name={detail.name}
            locationName={detail.location_name}
            memberCount={detail.member_count}
          />

          <SegmentBar
            tabs={TABS}
            activeTab={activeTab}
            onSetTab={handleSetTab}
          />

          <View className="flex-1">
            <TabContent
              leagueId={resolvedId}
              userRole={detail.user_role}
              activeTab={activeTab}
              statsPlayerId={statsPlayerId}
              onViewPlayerStats={handlePressPlayer}
            />
          </View>
        </View>
        {measuredTabBar}
      </SafeAreaView>
    </BottomTabBarHeightContext.Provider>
  );
}
