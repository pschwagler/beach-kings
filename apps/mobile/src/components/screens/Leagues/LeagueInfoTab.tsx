/**
 * LeagueInfoTab — Info tab of the League Detail screen.
 *
 * Shows:
 *   Description
 *   Join Requests (admin only, approve/deny)
 *   Players (member list with role badges)
 *   Seasons (with Active/Past badges)
 *   League Information (Access, Level, Location, Home Court)
 *   Leave League button (for members)
 *
 * Wireframe ref: league-info.html
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { useLeagueInfoTab } from './useLeagueInfoTab';
import type { JoinRequest, LeagueSeason } from '@beach-kings/shared';
import type { LeagueMemberRow } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionLabel({ title }: { readonly title: string }): React.ReactNode {
  return (
    <Text className="text-[12px] font-semibold text-muted uppercase tracking-wider px-4 pt-5 pb-2">
      {title}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Join request row (admin)
// ---------------------------------------------------------------------------

interface JoinRequestRowProps {
  readonly request: JoinRequest;
  readonly onApprove: (id: number) => Promise<void>;
  readonly onDeny: (id: number) => Promise<void>;
}

function JoinRequestRow({ request, onApprove, onDeny }: JoinRequestRowProps): React.ReactNode {
  const dateLabel = new Date(request.requested_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <View
      testID={`join-request-row-${request.id}`}
      className="flex-row items-center px-4 py-[12px] border-b border-divider gap-3"
    >
      <View className="w-10 h-10 rounded-full bg-elevated items-center justify-center flex-shrink-0">
        <Text className="text-[11px] font-bold text-muted">
          {request.initials ?? ''}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className="text-[14px] font-semibold text-default"
          numberOfLines={1}
        >
          {request.display_name}
        </Text>
        <Text className="text-[12px] text-muted mt-[1px]">
          Requested {dateLabel}
          {request.message != null ? ` · "${request.message}"` : ''}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Pressable
          testID={`approve-request-btn-${request.id}`}
          onPress={() => {
            void hapticLight();
            void onApprove(request.id);
          }}
          className="px-[12px] py-[8px] rounded-[8px] bg-brand-teal active:opacity-80"
        >
          <Text className="text-[12px] font-bold text-white">Approve</Text>
        </Pressable>
        <Pressable
          testID={`deny-request-btn-${request.id}`}
          onPress={() => {
            void hapticLight();
            void onDeny(request.id);
          }}
          className="px-[12px] py-[8px] rounded-[8px] border border-strong active:opacity-70"
        >
          <Text className="text-[12px] font-bold text-muted">
            Deny
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Member row
// ---------------------------------------------------------------------------

function MemberRow({ member }: { readonly member: LeagueMemberRow }): React.ReactNode {
  return (
    <View
      testID={`member-row-${member.player_id}`}
      className="flex-row items-center px-4 py-[12px] border-b border-divider gap-3"
    >
      <View className="w-9 h-9 rounded-full bg-brand-teal items-center justify-center flex-shrink-0">
        <Text className="text-[10px] font-bold text-white">
          {member.initials}
        </Text>
      </View>
      <Text
        className="flex-1 text-[14px] font-semibold text-default"
        numberOfLines={1}
      >
        {member.display_name}
      </Text>
      {member.role === 'admin' && (
        <View className="bg-warning-tint rounded-[6px] px-2 py-[2px]">
          <Text className="text-[10px] font-bold text-warning">Admin</Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Season row
// ---------------------------------------------------------------------------

function SeasonRow({ season }: { readonly season: LeagueSeason }): React.ReactNode {
  const startDate = new Date(season.started_at).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <View
      testID={`season-row-${season.id}`}
      className="flex-row items-center px-4 py-[12px] border-b border-divider gap-3"
    >
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-default">
          {season.name}
        </Text>
        <Text className="text-[12px] text-muted">
          Started {startDate} · {season.session_count} sessions
        </Text>
      </View>
      <View
        className={`rounded-[6px] px-2 py-[2px] ${
          season.is_active
            ? 'bg-success-tint'
            : 'bg-elevated'
        }`}
      >
        <Text
          className={`text-[10px] font-semibold ${
            season.is_active
              ? 'text-success'
              : 'text-muted'
          }`}
        >
          {season.is_active ? 'Active' : 'Past'}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Info row (label + value)
// ---------------------------------------------------------------------------

function InfoRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null;
}): React.ReactNode {
  if (value == null) return null;
  return (
    <View className="flex-row items-start px-4 py-[12px] border-b border-divider gap-4">
      <Text className="w-[110px] text-[12px] text-muted flex-shrink-0">
        {label}
      </Text>
      <Text className="flex-1 text-[13px] font-semibold text-default">
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface LeagueInfoTabProps {
  readonly leagueId: number | string;
  readonly userRole: 'admin' | 'member' | null;
}

export default function LeagueInfoTab({
  leagueId,
  userRole,
}: LeagueInfoTabProps): React.ReactNode {
  const { info, isLoading, isError, onApproveRequest, onDenyRequest, onLeaveLeague } =
    useLeagueInfoTab(leagueId);

  const [leavePending, setLeavePending] = useState(false);

  const handleLeave = (): void => {
    Alert.alert(
      'Leave League',
      'Are you sure you want to leave this league?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            void hapticMedium();
            setLeavePending(true);
            try {
              await onLeaveLeague();
            } finally {
              setLeavePending(false);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View testID="info-loading" className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError || info == null) {
    return (
      <View
        testID="info-error"
        className="flex-1 items-center justify-center px-8"
      >
        <Text className="text-[16px] font-bold text-default text-center">
          Failed to load info
        </Text>
      </View>
    );
  }

  const pendingRequests = info.join_requests.filter((r) => r.status === 'pending');
  const accessLabel = info.access_type === 'open' ? 'Public' : 'Invite Only';

  return (
    <ScrollView
      testID="info-tab"
      className="flex-1 bg-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      {/* Description */}
      {info.description != null && (
        <>
          <SectionLabel title="Description" />
          <View className="bg-surface rounded-[12px] mx-4 border border-divider px-4 py-3">
            <Text className="text-[14px] text-default leading-[1.5]">
              {info.description}
            </Text>
          </View>
        </>
      )}

      {/* Join Requests (admin only) */}
      {userRole === 'admin' && pendingRequests.length > 0 && (
        <>
          <SectionLabel title={`Join Requests (${pendingRequests.length})`} />
          <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden">
            {pendingRequests.map((req) => (
              <JoinRequestRow
                key={req.id}
                request={req}
                onApprove={onApproveRequest}
                onDeny={onDenyRequest}
              />
            ))}
          </View>
        </>
      )}

      {/* Members */}
      {info.members.length > 0 && (
        <>
          <SectionLabel title={`Players (${info.members.length})`} />
          <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden">
            {info.members.map((m) => (
              <MemberRow key={m.player_id} member={m} />
            ))}
          </View>
        </>
      )}

      {/* Seasons */}
      {info.seasons.length > 0 && (
        <>
          <SectionLabel title="Seasons" />
          <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden">
            {info.seasons.map((s) => (
              <SeasonRow key={s.id} season={s} />
            ))}
          </View>
        </>
      )}

      {/* League Information */}
      <SectionLabel title="League Information" />
      <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden">
        <InfoRow label="Access" value={accessLabel} />
        <InfoRow label="Skill Level" value={info.level} />
        <InfoRow label="Location" value={info.location_name} />
        <InfoRow label="Home Court" value={info.home_court_name} />
      </View>

      {/* Leave League */}
      {userRole === 'member' && (
        <Pressable
          testID="leave-league-button"
          onPress={handleLeave}
          disabled={leavePending}
          className="mx-4 mt-6 rounded-[12px] py-[14px] items-center border border-danger-tint active:opacity-70"
        >
          {leavePending ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text className="text-[14px] font-semibold text-danger">
              Leave League
            </Text>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}
