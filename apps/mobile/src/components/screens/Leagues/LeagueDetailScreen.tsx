/**
 * LeagueDetailScreen — Main orchestrator for the League Detail view.
 *
 * Shows:
 *   League header: name, location, member count, season badge, rank badge,
 *                  Invite button, Start Session button (admin)
 *   5-tab segment: Games | Standings | Chat | Sign Ups | Info
 *
 * Each tab renders a dedicated component. The Standings tab also supports
 * tapping a player row to push LeagueStatsTab as a sub-view.
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
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import BottomTabBar from '@/components/navigation/BottomTabBar';
import { hapticLight, hapticMedium } from '@/utils/haptics';
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
      className="bg-white dark:bg-dark-surface border-b border-[#e8e8e8] dark:border-border-subtle grow-0 shrink-0"
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
                  ? 'text-[#1a3a4a] dark:text-brand-teal'
                  : 'text-text-secondary dark:text-content-secondary'
              }`}
            >
              {tab.label}
            </Text>
            {isActive && (
              <View className="absolute bottom-0 left-4 right-4 h-[2px] bg-[#1a3a4a] dark:bg-brand-teal rounded-full" />
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
  readonly currentSeasonName: string | null;
  readonly isActive: boolean;
  readonly userRank: number | null;
  readonly userRole: 'admin' | 'member' | 'visitor';
  readonly onInvite: () => void;
  readonly onStartSession: () => void;
}

function LeagueHeader({
  name,
  locationName,
  memberCount,
  currentSeasonName,
  isActive,
  userRank,
  userRole,
  onInvite,
  onStartSession,
}: LeagueHeaderProps): React.ReactNode {
  return (
    <View
      testID="league-header"
      className="bg-white dark:bg-dark-surface px-4 pt-5 pb-4 border-b border-[#e8e8e8] dark:border-border-subtle"
    >
      {/* Title row */}
      <Text
        testID="league-header-name"
        className="text-[22px] font-extrabold text-text-default dark:text-content-primary"
        numberOfLines={2}
      >
        {name}
      </Text>

      {/* Meta row */}
      <View className="flex-row flex-wrap items-center gap-2 mt-[6px]">
        {locationName != null && (
          <Text className="text-[13px] text-text-secondary dark:text-content-secondary">
            {locationName}
          </Text>
        )}
        <Text className="text-[13px] text-text-secondary dark:text-content-secondary">
          {memberCount} members
        </Text>
      </View>

      {/* Badge row */}
      <View className="flex-row flex-wrap gap-2 mt-3">
        {isActive && currentSeasonName != null && (
          <View className="bg-green-100 dark:bg-green-900/30 rounded-[6px] px-[10px] py-[4px]">
            <Text className="text-[11px] font-bold text-green-700 dark:text-green-400">
              {currentSeasonName} · Active
            </Text>
          </View>
        )}
        {userRank != null && (
          <View className="bg-[#c8a84b]/20 rounded-[6px] px-[10px] py-[4px]">
            <Text className="text-[11px] font-bold text-[#c8a84b]">
              #{userRank} Ranked
            </Text>
          </View>
        )}
      </View>

      {/* Action row */}
      <View className="flex-row gap-2 mt-4">
        {(userRole === 'admin' || userRole === 'member') && (
          <Pressable
            testID="invite-button"
            onPress={() => {
              void hapticLight();
              onInvite();
            }}
            className="flex-1 rounded-[10px] py-[10px] items-center border border-[#1a3a4a] dark:border-brand-teal active:opacity-70"
          >
            <Text className="text-[13px] font-semibold text-[#1a3a4a] dark:text-brand-teal">
              Invite Players
            </Text>
          </Pressable>
        )}
        {userRole === 'admin' && (
          <Pressable
            testID="start-session-button"
            onPress={() => {
              void hapticMedium();
              onStartSession();
            }}
            className="flex-1 rounded-[10px] py-[10px] items-center bg-[#1a3a4a] dark:bg-brand-teal active:opacity-80"
          >
            <Text className="text-[13px] font-bold text-white">
              Start Session
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tab content renderer
// ---------------------------------------------------------------------------

interface TabContentProps {
  readonly leagueId: number | string;
  readonly userRole: 'admin' | 'member' | 'visitor';
  readonly activeTab: LeagueDetailTab;
  readonly statsPlayerId: number | string | null;
  readonly onPressPlayer: (id: number | string) => void;
  readonly onViewPlayerStats: (id: number | string) => void;
}

function TabContent({
  leagueId,
  userRole,
  activeTab,
  statsPlayerId,
  onPressPlayer,
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
      return <LeagueDashboardTab leagueId={leagueId} />;
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
    onInvite,
    onStartSession,
    onPressPlayer,
  } = useLeagueDetailScreen(resolvedId);

  // Track which player row was tapped in standings to push stats sub-view
  const [statsPlayerId, setStatsPlayerId] = useState<number | string | null>(null);

  const handlePressPlayer = (id: number | string): void => {
    if (activeTab === 'standings') {
      setStatsPlayerId(id);
    } else {
      onPressPlayer(id);
    }
  };

  const handleSetTab = (tab: LeagueDetailTab): void => {
    // Clear stats sub-view when switching away from standings
    if (tab !== 'standings') {
      setStatsPlayerId(null);
    }
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
        router.push(`/(tabs)/add-games?leagueId=${resolvedId}`);
      }}
      accessibilityRole="button"
      accessibilityLabel="Add game"
      className="min-h-touch items-center justify-center px-2 active:opacity-70"
    >
      <Text className="text-[14px] font-semibold text-white">+ Add Game</Text>
    </Pressable>
  ) : undefined;

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-[#f5f5f5] dark:bg-base"
        edges={['top']}
      >
        <TopNav title="League" showBack />
        <View testID="league-detail-loading" className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
        <BottomTabBar active="leagues" />
      </SafeAreaView>
    );
  }

  if (isError || detail == null) {
    return (
      <SafeAreaView
        className="flex-1 bg-[#f5f5f5] dark:bg-base"
        edges={['top']}
      >
        <TopNav title="League" showBack />
        <View
          testID="league-detail-error"
          className="flex-1 items-center justify-center px-8"
        >
          <Text className="text-[16px] font-bold text-text-default dark:text-content-primary text-center">
            Failed to load league
          </Text>
        </View>
        <BottomTabBar active="leagues" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      edges={['top']}
    >
      <TopNav title={title} showBack rightAction={addGameAction} />
      <View testID="league-detail-screen" className="flex-1 bg-[#f5f5f5] dark:bg-base">
        <LeagueHeader
          name={detail.name}
          locationName={detail.location_name}
          memberCount={detail.member_count}
          currentSeasonName={detail.current_season_name}
          isActive={detail.is_active}
          userRank={detail.user_rank}
          userRole={detail.user_role}
          onInvite={onInvite}
          onStartSession={onStartSession}
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
            onPressPlayer={onPressPlayer}
            onViewPlayerStats={handlePressPlayer}
          />
        </View>
      </View>
      <BottomTabBar active="leagues" />
    </SafeAreaView>
  );
}
