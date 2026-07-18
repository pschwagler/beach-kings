/**
 * LeagueDetailScreen — Main orchestrator for the League Detail view.
 *
 * Shows:
 *   Compact league header: name, location, member count
 *   Segment bar: Games | Standings | Chat | Sign Ups | Info
 *
 * Members/admins see the full tab set. Non-members (visitors) see the Info
 * tab, the Standings tab too (unless the league is private, which 403s that
 * request for non-members), and a Join CTA banner (Join for open leagues,
 * Request to join for invite-only ones). Visitor player taps route to the
 * player's public profile rather than the members-only in-league stats.
 *
 * The Add Game action lives in TopNav. Each tab renders a dedicated component.
 * For members, the Standings tab also supports tapping a player row to push
 * LeagueStatsTab as a sub-view.
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
  Alert,
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
        <Text className="text-[12px] text-muted">
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Visitor join banner (non-members only)
// ---------------------------------------------------------------------------

interface VisitorJoinBannerProps {
  readonly canJoinDirectly: boolean;
  readonly canRequestToJoin: boolean;
  readonly hasPendingRequest: boolean;
  readonly isJoiningLeague: boolean;
  readonly isRequestingToJoin: boolean;
  readonly onJoinLeague: () => void;
  readonly onRequestToJoin: () => void;
}

/**
 * Banner shown to non-members. Renders a "Join" action for open leagues
 * (direct join, no approval needed), a "Request to join" action for
 * invite-only leagues, and a disabled "Request sent" pill once a request is
 * pending.
 */
function VisitorJoinBanner({
  canJoinDirectly,
  canRequestToJoin,
  hasPendingRequest,
  isJoiningLeague,
  isRequestingToJoin,
  onJoinLeague,
  onRequestToJoin,
}: VisitorJoinBannerProps): React.ReactNode {
  const action = ((): React.ReactNode => {
    if (hasPendingRequest) {
      return (
        <View
          testID="league-join-pending"
          className="px-4 py-2 rounded-full bg-page"
        >
          <Text className="text-[13px] font-semibold text-muted">Request sent</Text>
        </View>
      );
    }
    if (canJoinDirectly) {
      return (
        <Pressable
          testID="league-join-btn"
          disabled={isJoiningLeague}
          onPress={() => {
            void hapticLight();
            onJoinLeague();
          }}
          accessibilityRole="button"
          accessibilityLabel="Join league"
          className="px-4 py-2 rounded-full bg-brand-teal active:opacity-70"
        >
          <Text className="text-[13px] font-semibold text-white">
            {isJoiningLeague ? 'Joining…' : 'Join'}
          </Text>
        </Pressable>
      );
    }
    if (canRequestToJoin) {
      return (
        <Pressable
          testID="league-request-join-btn"
          disabled={isRequestingToJoin}
          onPress={() => {
            void hapticLight();
            onRequestToJoin();
          }}
          accessibilityRole="button"
          accessibilityLabel="Request to join league"
          className="px-4 py-2 rounded-full bg-brand-teal active:opacity-70"
        >
          <Text className="text-[13px] font-semibold text-white">
            {isRequestingToJoin ? 'Sending…' : 'Request to join'}
          </Text>
        </Pressable>
      );
    }
    return null;
  })();

  if (action == null) {
    return null;
  }

  return (
    <View
      testID="league-join-banner"
      className="bg-surface px-4 py-3 border-b border-divider flex-row items-center justify-between gap-x-3"
    >
      <Text className="text-[13px] text-muted flex-1" numberOfLines={2}>
        Viewing as a non-member
      </Text>
      {action}
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
    isVisitor,
    visibleTabs,
    canJoinDirectly,
    canRequestToJoin,
    hasPendingRequest,
    isJoiningLeague,
    isRequestingToJoin,
    onJoinLeague,
    onRequestToJoin,
  } = useLeagueDetailScreen(resolvedId);

  // Track which player row was tapped in standings to push stats sub-view
  const [statsPlayerId, setStatsPlayerId] = useState<number | string | null>(null);

  // Measured at runtime so LeagueChatTab can align its composer to the keyboard
  // top precisely (avoids hardcoded estimate drift across devices / iOS versions).
  const [tabBarHeight, setTabBarHeight] = useState(0);

  // Surface join/request failures instead of letting them fail silently —
  // both handlers can reject (network error, backend 400, etc).
  const handleJoinLeague = async (): Promise<void> => {
    try {
      await onJoinLeague();
    } catch {
      Alert.alert('Could not join league', 'Something went wrong. Please try again.');
    }
  };

  const handleRequestToJoin = async (): Promise<void> => {
    try {
      await onRequestToJoin();
    } catch {
      Alert.alert('Could not send request', 'Something went wrong. Please try again.');
    }
  };

  const handlePressPlayer = (id: number | string): void => {
    // Members drilling into Standings see the in-league per-player stats.
    // Visitors (and members on other tabs) go to the player's public profile.
    if (!isVisitor && activeTab === 'standings') {
      setStatsPlayerId(id);
    } else {
      onPressPlayer(id);
    }
  };

  // Only render the tabs the caller is allowed to see.
  const tabsForRole = TABS.filter((t) => visibleTabs.includes(t.key));

  const handleSetTab = (tab: LeagueDetailTab): void => {
    // Always clear the stats sub-view on tab switch — including re-tapping
    // Standings, which should drop the user back to the standings list.
    setStatsPlayerId(null);
    onSetTab(tab);
  };

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
          <TopNav title="League" showBack />
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
          <TopNav title="League" showBack />
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
        <TopNav title="League" showBack rightAction={addGameAction} />
        <View testID="league-detail-screen" className="flex-1 bg-page">
          <LeagueHeader
            name={detail.name}
            locationName={detail.location_name}
            memberCount={detail.member_count}
          />

          {isVisitor && (
            <VisitorJoinBanner
              canJoinDirectly={canJoinDirectly}
              canRequestToJoin={canRequestToJoin}
              hasPendingRequest={hasPendingRequest}
              isJoiningLeague={isJoiningLeague}
              isRequestingToJoin={isRequestingToJoin}
              onJoinLeague={() => void handleJoinLeague()}
              onRequestToJoin={() => void handleRequestToJoin()}
            />
          )}

          <SegmentBar
            tabs={tabsForRole}
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
