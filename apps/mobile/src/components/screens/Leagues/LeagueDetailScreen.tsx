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
import AppText from '@/components/ui/AppText';
import {
  View,
  Pressable,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import { hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import TabView from '@/components/ui/TabView';
import {
  normalizeLeagueDetailTab,
  useLeagueDetailScreen,
  type LeagueDetailTab,
} from './useLeagueDetailScreen';
import LeagueDashboardTab from './LeagueDashboardTab';
import LeagueChatTab from './LeagueChatTab';
import LeagueSignupsTab from './LeagueSignupsTab';
import LeagueInfoTab from './LeagueInfoTab';
import LeagueMatchesTab from './LeagueMatchesTab';
import LeagueStatsTab from './LeagueStatsTab';
import LeagueInvitationBanner from './LeagueInvitationBanner';

// ---------------------------------------------------------------------------
// Tab definition
// ---------------------------------------------------------------------------

const TABS = [
  { value: 'games', label: 'Games', testID: 'segment-tab-games' },
  { value: 'standings', label: 'Standings', testID: 'segment-tab-standings' },
  { value: 'chat', label: 'Chat', testID: 'segment-tab-chat' },
  { value: 'signups', label: 'Sign Ups', testID: 'segment-tab-signups' },
  { value: 'info', label: 'Info', testID: 'segment-tab-info' },
] as const;

// ---------------------------------------------------------------------------
// Segment bar
// ---------------------------------------------------------------------------

interface SegmentBarProps {
  readonly items: readonly (typeof TABS)[number][];
  readonly activeTab: LeagueDetailTab;
  readonly onSetTab: (tab: LeagueDetailTab) => void;
}

function SegmentBar({ items, activeTab, onSetTab }: SegmentBarProps): React.ReactNode {
  return (
    <TabView
      testID="league-segment-bar"
      items={items}
      value={activeTab}
      onValueChange={(tab) => {
        Keyboard.dismiss();
        void hapticLight();
        onSetTab(tab);
      }}
    />
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
      <AppText
        testID="league-header-name"
        family="display"
        className="text-[20px] font-bold text-default"
        numberOfLines={2}
        accessibilityLabel={name}
      >
        {name}
      </AppText>

      <View className="flex-row flex-wrap items-center gap-x-2 mt-[2px]">
        {locationName != null && (
          <AppText className="text-[12px] text-muted">{locationName}</AppText>
        )}
        {locationName != null && (
          <AppText className="text-[12px] text-muted">·</AppText>
        )}
        <AppText className="text-[12px] text-muted">
          {memberCount} {memberCount === 1 ? 'member' : 'members'}
        </AppText>
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
  readonly isInviteOnly: boolean;
  readonly joinRequestStatus?: 'pending' | 'approved' | 'rejected' | null;
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
  isInviteOnly,
  joinRequestStatus,
}: VisitorJoinBannerProps): React.ReactNode {
  const action = ((): React.ReactNode => {
    if (hasPendingRequest) {
      return (
        <View
          testID="league-join-pending"
          className="px-4 py-2 rounded-full bg-page"
        >
          <AppText className="text-[13px] font-semibold text-muted">Request sent</AppText>
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
          <AppText className="text-[13px] font-semibold text-on-brand-teal">
            {isJoiningLeague ? 'Joining…' : 'Join'}
          </AppText>
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
          <AppText className="text-[13px] font-semibold text-on-brand-teal">
            {isRequestingToJoin ? 'Sending…' : 'Request to join'}
          </AppText>
        </Pressable>
      );
    }
    if (isInviteOnly) {
      return (
        <AppText className="text-[13px] font-semibold text-muted text-right flex-1">
          Invite only · Message an admin to learn more
        </AppText>
      );
    }
    if (joinRequestStatus === 'rejected') {
      return (
        <AppText className="text-[13px] font-semibold text-muted text-right flex-1">
          Request declined · An admin must invite you
        </AppText>
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
      <AppText className="text-[13px] text-muted flex-1" numberOfLines={2}>
        Viewing as a non-member
      </AppText>
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
  readonly chatDraft: string;
  readonly onChatDraftChange: (value: string) => void;
}

function TabContent({
  leagueId,
  userRole,
  activeTab,
  statsPlayerId,
  onViewPlayerStats,
  chatDraft,
  onChatDraftChange,
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
      return (
        <LeagueChatTab
          leagueId={leagueId}
          draft={chatDraft}
          onDraftChange={onChatDraftChange}
        />
      );
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
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const resolvedId = leagueIdProp ?? params.id ?? '1';
  const initialTab = normalizeLeagueDetailTab(params.tab);
  const router = useRouter();

  const {
    detail,
    isLoading,
    isError,
    errorTitle,
    errorDescription,
    activeTab,
    onSetTab,
    onPressPlayer,
    isVisitor,
    visibleTabs,
    canJoinDirectly,
    canRequestToJoin,
    hasPendingRequest,
    isInviteOnly,
    isJoiningLeague,
    isRequestingToJoin,
    onJoinLeague,
    onRequestToJoin,
    hasLeagueInvitation,
    isRespondingToInvitation,
    onAcceptInvitation,
    onDeclineInvitation,
  } = useLeagueDetailScreen(resolvedId, initialTab);

  // Track which player row was tapped in standings to push stats sub-view
  const [statsPlayerId, setStatsPlayerId] = useState<number | string | null>(null);
  // Preserve an unsent league-chat draft when the user visits another league
  // tab. Sending or explicitly editing the composer remains the only way this
  // text changes.
  const [chatDraft, setChatDraft] = useState('');

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
  const tabsForRole = TABS.filter((tab) => visibleTabs.includes(tab.value));

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
      <AppText className="text-[14px] font-semibold text-inverse">+ Add Game</AppText>
    </Pressable>
  ) : undefined;

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top', 'bottom']}
      >
        <TopNav title="League" showBack />
        <View testID="league-detail-loading" className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || detail == null) {
    return (
      <SafeAreaView
        className="flex-1 bg-page"
        edges={['top', 'bottom']}
      >
        <TopNav title="League" showBack />
        <View
          testID="league-detail-error"
          className="flex-1 items-center justify-center px-8"
        >
          <AppText className="text-[16px] font-bold text-default text-center">
            {errorTitle}
          </AppText>
          <AppText className="text-[13px] text-muted text-center mt-2">
            {errorDescription}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top', 'bottom']}
    >
      <TopNav title="League" showBack rightAction={addGameAction} />
      <View testID="league-detail-screen" className="flex-1 bg-page">
        <LeagueHeader
          name={detail.name}
          locationName={detail.location_name}
          memberCount={detail.member_count}
        />

        {hasLeagueInvitation ? (
          <LeagueInvitationBanner
            leagueName={detail.name}
            isResponding={isRespondingToInvitation}
            onAccept={() => void onAcceptInvitation()}
            onDecline={() => void onDeclineInvitation()}
          />
        ) : isVisitor ? (
          <VisitorJoinBanner
            canJoinDirectly={canJoinDirectly}
            canRequestToJoin={canRequestToJoin}
            hasPendingRequest={hasPendingRequest}
            isJoiningLeague={isJoiningLeague}
            isRequestingToJoin={isRequestingToJoin}
            onJoinLeague={() => void handleJoinLeague()}
            onRequestToJoin={() => void handleRequestToJoin()}
            isInviteOnly={isInviteOnly}
            joinRequestStatus={detail.join_request_status}
          />
        ) : null}

        <SegmentBar
          items={tabsForRole}
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
            chatDraft={chatDraft}
            onChatDraftChange={setChatDraft}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
