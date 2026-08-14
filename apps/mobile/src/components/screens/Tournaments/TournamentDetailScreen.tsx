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
import AppText from '@/components/ui/AppText';
import {
  View,
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
import { usePaletteColors } from '@/theme/usePaletteColors';

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
  // KoB tournaments do not have a fixed max-players cap on the backend — the
  // tournament fills based on courts/pool config. Show the registered count
  // directly rather than fabricating a denominator.
  const playerCount = tournament.player_count;
  const spotsLabel = `${playerCount} player${playerCount === 1 ? '' : 's'}`;

  return (
    <View className="px-[16px] pt-[16px]">
      <AppText className="text-[22px] font-bold text-default">
        {tournament.name}
      </AppText>
      <AppText className="text-[13px] text-muted mt-[4px]">
        {formatDate(tournament.scheduled_date)}
      </AppText>
      {tournament.director_name != null && (
        <AppText className="text-[13px] text-muted mt-[2px]">
          Organized by {tournament.director_name}
        </AppText>
      )}
      <View className="flex-row gap-[6px] flex-wrap mt-[10px]">
        <View className="bg-info-tint px-[10px] py-[4px] rounded-[12px]">
          <AppText className="text-[12px] font-semibold text-brand-teal">
            {FORMAT_LABELS[tournament.format] ?? tournament.format}
          </AppText>
        </View>
        <View className="bg-elevated px-[10px] py-[4px] rounded-[12px]">
          <AppText className="text-[12px] text-muted">{spotsLabel}</AppText>
        </View>
        <View className="bg-elevated px-[10px] py-[4px] rounded-[12px]">
          <AppText className="text-[12px] text-muted">
            {GENDER_LABELS[tournament.gender] ?? tournament.gender}
          </AppText>
        </View>
        <View className="bg-elevated px-[10px] py-[4px] rounded-[12px]">
          <AppText className="text-[12px] text-muted">
            {tournament.status === 'ACTIVE' ? 'In Progress' : tournament.status === 'SETUP' ? 'Upcoming' : tournament.status}
          </AppText>
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
  const palette = usePaletteColors();
  if (role === 'visitor') {
    return (
      <View className="px-[16px] mt-[16px]">
        <TouchableOpacity
          testID="tournament-request-join-btn"
          onPress={onRequestJoin}
          disabled={isActioning}
          className="bg-brand-teal rounded-[12px] py-[14px] items-center"
        >
          {isActioning ? (
            <ActivityIndicator color={palette.onBrandTeal} />
          ) : (
            <AppText className="text-on-brand-teal text-[15px] font-bold">Request to Join</AppText>
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
          className="bg-warning-tint border border-warning rounded-[12px] py-[14px] items-center"
        >
          <AppText className="text-warning text-[15px] font-semibold">Request Pending</AppText>
        </View>
      </View>
    );
  }

  if (role === 'registered') {
    return (
      <View className="px-[16px] mt-[16px] gap-[8px]">
        <View
          testID="tournament-registered-badge"
          className="bg-success-tint border border-success rounded-[12px] py-[14px] items-center"
        >
          <AppText className="text-success text-[15px] font-semibold">Registered</AppText>
        </View>
        <TouchableOpacity
          testID="tournament-invite-friends-btn"
          onPress={onInviteFriends}
          className="border border-brand-teal rounded-[12px] py-[12px] items-center"
        >
          <AppText className="text-brand-teal text-[14px] font-semibold">
            Invite Friends
          </AppText>
        </TouchableOpacity>
      </View>
    );
  }

  if (role === 'waitlist') {
    return (
      <View className="px-[16px] mt-[16px]">
        <View
          testID="tournament-waitlist-badge"
          className="bg-elevated border border-divider rounded-[12px] py-[14px] items-center"
        >
          <AppText className="text-muted text-[15px] font-semibold">
            On Waitlist
          </AppText>
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
      <AppText className="text-[15px] font-bold text-default mb-[10px]">
        Details
      </AppText>
      <View
        testID="tournament-details-grid"
        className="bg-surface rounded-[12px] border border-divider overflow-hidden"
      >
        {items.map(({ label, value }, i) => (
          <View
            key={label}
            className={`flex-row items-center px-[14px] py-[12px] ${
              i < items.length - 1 ? 'border-b border-divider' : ''
            }`}
          >
            <AppText className="text-[13px] text-muted flex-1">{label}</AppText>
            <AppText className="text-[13px] font-semibold text-default">{value}</AppText>
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
      <AppText className="text-[16px] font-semibold text-default text-center">
        Could not load tournament
      </AppText>
      <TouchableOpacity
        testID="tournament-detail-retry-btn"
        onPress={onRetry}
        className="bg-brand-teal px-[24px] py-[12px] rounded-[10px]"
      >
        <AppText className="text-on-brand-teal text-[14px] font-semibold">Retry</AppText>
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
        className="flex-1 bg-page"
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
        className="flex-1 bg-page"
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
      className="flex-1 bg-page"
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
                <AppText className="text-[15px] font-bold text-default mb-[10px]">
                  Players ({tournament.players.length})
                </AppText>
                <View
                  testID="tournament-players-section"
                  className="bg-surface rounded-[12px] border border-divider p-[14px]"
                >
                  <AppText className="text-[13px] text-muted">
                    {tournament.players.length} player{tournament.players.length !== 1 ? 's' : ''} registered
                  </AppText>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
