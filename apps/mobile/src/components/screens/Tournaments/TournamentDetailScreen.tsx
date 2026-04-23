/**
 * TournamentDetailScreen — full tournament detail view with role-based actions.
 *
 * Sections:
 *   - Hero: name, location, datetime, badges (format, spots, open/invite)
 *   - Action bar (role-based): Request to Join / Registered / Waitlist / etc.
 *   - Players section: avatar stack + "See All" link
 *   - Details grid: Format / Level / Courts / Game To / Cost / etc.
 *   - Location card
 *
 * Wireframe ref: tournament-detail.html
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import TournamentDetailSkeleton from './TournamentDetailSkeleton';
import { useTournamentDetailScreen } from './useTournamentDetailScreen';
import type { KobTournamentDetail } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORMAT_LABELS: Record<string, string> = {
  POOLS_PLAYOFFS: 'King of the Beach',
  FULL_ROUND_ROBIN: 'Full Round Robin',
};

const GENDER_LABELS: Record<string, string> = {
  coed: 'Coed',
  mens: "Men's",
  womens: "Women's",
};

function formatDate(isoDate: string | null): string {
  if (isoDate == null) return 'Date TBD';
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Hero section
// ---------------------------------------------------------------------------

interface HeroProps {
  readonly tournament: KobTournamentDetail;
}

function Hero({ tournament }: HeroProps): React.ReactNode {
  const spotsLabel = `${tournament.player_count}/${tournament.player_count + 4} spots`;

  return (
    <View className="px-[16px] pt-[16px]">
      <Text className="text-[22px] font-bold text-text-default dark:text-content-primary">
        {tournament.name}
      </Text>
      <Text className="text-[13px] text-text-secondary dark:text-content-secondary mt-[4px]">
        {formatDate(tournament.scheduled_date)}
      </Text>
      {tournament.director_name != null && (
        <Text className="text-[13px] text-text-secondary dark:text-content-secondary mt-[2px]">
          Organized by {tournament.director_name}
        </Text>
      )}
      <View className="flex-row gap-[6px] flex-wrap mt-[10px]">
        <View className="bg-[#e8f4f8] px-[10px] py-[4px] rounded-[12px]">
          <Text className="text-[12px] font-semibold text-[#2a7d9c]">
            {FORMAT_LABELS[tournament.format] ?? tournament.format}
          </Text>
        </View>
        <View className="bg-[#f0f0f0] dark:bg-[#2a2a2a] px-[10px] py-[4px] rounded-[12px]">
          <Text className="text-[12px] text-text-secondary dark:text-content-secondary">{spotsLabel}</Text>
        </View>
        <View className="bg-[#f0f0f0] dark:bg-[#2a2a2a] px-[10px] py-[4px] rounded-[12px]">
          <Text className="text-[12px] text-text-secondary dark:text-content-secondary">
            {GENDER_LABELS[tournament.gender] ?? tournament.gender}
          </Text>
        </View>
        <View className="bg-[#f0f0f0] dark:bg-[#2a2a2a] px-[10px] py-[4px] rounded-[12px]">
          <Text className="text-[12px] text-text-secondary dark:text-content-secondary">
            {tournament.status === 'ACTIVE' ? 'In Progress' : tournament.status === 'SETUP' ? 'Upcoming' : tournament.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Role-based action bar
// ---------------------------------------------------------------------------

interface ActionBarProps {
  readonly role: string;
  readonly isActioning: boolean;
  readonly onRequestJoin: () => void;
  readonly onInviteFriends: () => void;
}

function ActionBar({
  role,
  isActioning,
  onRequestJoin,
  onInviteFriends,
}: ActionBarProps): React.ReactNode {
  if (role === 'visitor') {
    return (
      <View className="px-[16px] mt-[16px]">
        <TouchableOpacity
          testID="tournament-request-join-btn"
          onPress={onRequestJoin}
          disabled={isActioning}
          className="bg-[#1a3a4a] rounded-[12px] py-[14px] items-center"
        >
          {isActioning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-[15px] font-bold">Request to Join</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (role === 'requested') {
    return (
      <View className="px-[16px] mt-[16px]">
        <View
          testID="tournament-pending-badge"
          className="bg-[#fff8e6] border border-[#d4a843] rounded-[12px] py-[14px] items-center"
        >
          <Text className="text-[#8b6914] text-[15px] font-semibold">Request Pending</Text>
        </View>
      </View>
    );
  }

  if (role === 'registered') {
    return (
      <View className="px-[16px] mt-[16px] gap-[8px]">
        <View
          testID="tournament-registered-badge"
          className="bg-[#dcfce7] border border-[#86efac] rounded-[12px] py-[14px] items-center"
        >
          <Text className="text-[#15803d] text-[15px] font-semibold">Registered</Text>
        </View>
        <TouchableOpacity
          testID="tournament-invite-friends-btn"
          onPress={onInviteFriends}
          className="border border-[#1a3a4a] dark:border-[#4a6a7a] rounded-[12px] py-[12px] items-center"
        >
          <Text className="text-[#1a3a4a] dark:text-content-primary text-[14px] font-semibold">
            Invite Friends
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (role === 'waitlist') {
    return (
      <View className="px-[16px] mt-[16px]">
        <View
          testID="tournament-waitlist-badge"
          className="bg-[#f0f0f0] dark:bg-[#2a2a2a] border border-[#ddd] dark:border-[#333] rounded-[12px] py-[14px] items-center"
        >
          <Text className="text-text-secondary dark:text-content-secondary text-[15px] font-semibold">
            On Waitlist
          </Text>
        </View>
      </View>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Details grid
// ---------------------------------------------------------------------------

interface DetailsGridProps {
  readonly tournament: KobTournamentDetail;
}

function DetailsGrid({ tournament }: DetailsGridProps): React.ReactNode {
  const items = [
    { label: 'Format', value: FORMAT_LABELS[tournament.format] ?? tournament.format },
    { label: 'Gender', value: GENDER_LABELS[tournament.gender] ?? tournament.gender },
    { label: 'Courts', value: String(tournament.num_courts) },
    { label: 'Game To', value: String(tournament.game_to) },
    { label: 'Score Cap', value: tournament.score_cap != null ? String(tournament.score_cap) : '—' },
    { label: 'Players', value: String(tournament.player_count) },
  ];

  return (
    <View className="px-[16px] mt-[20px]">
      <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[10px]">
        Details
      </Text>
      <View
        testID="tournament-details-grid"
        className="bg-white dark:bg-[#1a1a1a] rounded-[12px] border border-[#eee] dark:border-[#2a2a2a] overflow-hidden"
      >
        {items.map(({ label, value }, i) => (
          <View
            key={label}
            className={`flex-row items-center px-[14px] py-[12px] ${
              i < items.length - 1 ? 'border-b border-[#f0f0f0] dark:border-[#2a2a2a]' : ''
            }`}
          >
            <Text className="text-[13px] text-text-secondary dark:text-content-secondary flex-1">{label}</Text>
            <Text className="text-[13px] font-semibold text-text-default dark:text-content-primary">{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  readonly onRetry: () => void;
}

function TournamentDetailErrorState({ onRetry }: ErrorStateProps): React.ReactNode {
  return (
    <View
      testID="tournament-detail-error"
      className="flex-1 items-center justify-center px-[24px] gap-[16px]"
    >
      <Text className="text-[16px] font-semibold text-text-default dark:text-content-primary text-center">
        Could not load tournament
      </Text>
      <TouchableOpacity
        testID="tournament-detail-retry-btn"
        onPress={onRetry}
        className="bg-[#1a3a4a] px-[24px] py-[12px] rounded-[10px]"
      >
        <Text className="text-white text-[14px] font-semibold">Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface Props {
  readonly tournamentId: number;
}

export default function TournamentDetailScreen({ tournamentId }: Props): React.ReactNode {
  const {
    tournament,
    isLoading,
    error,
    isRefreshing,
    role,
    isActioning,
    onRefresh,
    onRetry,
    onRequestJoin,
    onInviteFriends,
  } = useTournamentDetailScreen(tournamentId);

  if (isLoading && !isRefreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="tournament-detail-screen"
      >
        <TopNav title="Tournament" showBack />
        <TournamentDetailSkeleton />
      </SafeAreaView>
    );
  }

  if (error != null && tournament == null) {
    return (
      <SafeAreaView
        className="flex-1 bg-bg-page dark:bg-base"
        edges={['top']}
        testID="tournament-detail-screen"
      >
        <TopNav title="Tournament" showBack />
        <TournamentDetailErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="tournament-detail-screen"
    >
      <TopNav title="Tournament" showBack />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        testID="tournament-detail-scroll"
      >
        {tournament != null && (
          <>
            <Hero tournament={tournament} />
            <ActionBar
              role={role}
              isActioning={isActioning}
              onRequestJoin={() => { void onRequestJoin(); }}
              onInviteFriends={onInviteFriends}
            />
            <DetailsGrid tournament={tournament} />

            {/* Players section */}
            {tournament.players.length > 0 && (
              <View className="px-[16px] mt-[20px]">
                <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[10px]">
                  Players ({tournament.players.length})
                </Text>
                <View
                  testID="tournament-players-section"
                  className="bg-white dark:bg-[#1a1a1a] rounded-[12px] border border-[#eee] dark:border-[#2a2a2a] p-[14px]"
                >
                  <Text className="text-[13px] text-text-secondary dark:text-content-secondary">
                    {tournament.players.length} player{tournament.players.length !== 1 ? 's' : ''} registered
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
