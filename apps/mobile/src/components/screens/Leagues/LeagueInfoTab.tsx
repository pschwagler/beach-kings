/**
 * LeagueInfoTab — Info tab of the League Detail screen.
 *
 * Shows:
 *   Description (admin: inline edit, auto-save)
 *   Join Requests (admin only, approve/deny)
 *   Players (admin: role action sheet, remove button disabled for self)
 *   Seasons (admin: New Season stub)
 *   League Information (admin: Access/Level pickers auto-save; multi-court pill list)
 *   Admin invite management entry point
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
  TextInput,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { api } from '@/lib/api';
import { useBottomTabBarContentPadding } from '@/components/navigation/BottomTabBar';
import { routes } from '@/lib/navigation';
import CourtPickerModal from '@/components/ui/CourtPickerModal';
import Avatar from '@/components/ui/Avatar';
import { useLeagueInfoTab } from './useLeagueInfoTab';
import SeasonFormSheet from './SeasonFormSheet';
import type { HomeCourtResponse, JoinRequest, LeagueMemberRow, LeagueSeason } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEVEL_OPTIONS = ['Beginner', 'Intermediate', 'Advanced', 'Open'];
const ACCESS_OPTIONS: Array<{ label: string; value: 'open' | 'invite_only' }> = [
  { label: 'Public', value: 'open' },
  { label: 'Invite Only', value: 'invite_only' },
];

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
      <Avatar
        imageUrl={request.avatar_url}
        name={request.display_name}
        size="md"
        colorSeed={request.player_id}
        accessible={false}
      />
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
// Member row (admin variant with role picker and remove)
// ---------------------------------------------------------------------------

interface MemberRowProps {
  readonly member: LeagueMemberRow;
  readonly isAdmin: boolean;
  readonly isSelf: boolean;
  readonly onChangeRole: (memberId: number, role: 'admin' | 'member') => Promise<void>;
  readonly onRemovePlayer: (memberId: number) => Promise<void>;
}

function MemberRow({
  member,
  isAdmin,
  isSelf,
  onChangeRole,
  onRemovePlayer,
}: MemberRowProps): React.ReactNode {
  const handleRoleTap = (): void => {
    if (!isAdmin) return;
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    const label = nextRole === 'admin' ? 'Make Admin' : 'Remove Admin';
    Alert.alert(member.display_name, `Change role to ${nextRole}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        onPress: () => {
          void hapticLight();
          void onChangeRole(member.id, nextRole);
        },
      },
    ]);
  };

  const handleRemove = (): void => {
    Alert.alert('Remove Player', `Remove ${member.display_name} from the league?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void hapticMedium();
          void onRemovePlayer(member.id);
        },
      },
    ]);
  };

  return (
    <View
      testID={`member-row-${member.player_id}`}
      className="flex-row items-center px-4 py-[12px] border-b border-divider gap-3"
    >
      <Avatar
        imageUrl={member.avatar_url}
        name={member.display_name}
        size={36}
        colorSeed={member.player_id}
        accessible={false}
      />
      <Text
        className="flex-1 text-[14px] font-semibold text-default"
        numberOfLines={1}
      >
        {member.display_name}
      </Text>
      {/* Role badge — admin can tap to toggle */}
      {member.role === 'admin' && (
        <Pressable
          testID={`role-badge-${member.player_id}`}
          onPress={handleRoleTap}
          disabled={!isAdmin}
          className="bg-warning-tint rounded-[6px] px-2 py-[2px] active:opacity-70"
        >
          <Text className="text-[10px] font-bold text-warning">Admin</Text>
        </Pressable>
      )}
      {member.role === 'member' && isAdmin && (
        <Pressable
          testID={`role-badge-${member.player_id}`}
          onPress={handleRoleTap}
          className="bg-elevated rounded-[6px] px-2 py-[2px] active:opacity-70"
        >
          <Text className="text-[10px] font-semibold text-muted">Member</Text>
        </Pressable>
      )}
      {/* Remove button — disabled for self */}
      {isAdmin && (
        <Pressable
          testID={`remove-member-btn-${member.player_id}`}
          onPress={handleRemove}
          disabled={isSelf}
          className={`ml-1 px-[10px] py-[6px] rounded-[8px] border ${
            isSelf ? 'border-divider opacity-40' : 'border-danger-tint active:opacity-70'
          }`}
        >
          <Text
            className={`text-[11px] font-semibold ${isSelf ? 'text-muted' : 'text-danger'}`}
          >
            Remove
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Season row
// ---------------------------------------------------------------------------

function formatSeasonDate(value: string | null | undefined): string {
  if (!value) return 'TBD';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SeasonRow({
  season,
  isAdmin,
  onPress,
}: {
  readonly season: LeagueSeason;
  readonly isAdmin: boolean;
  readonly onPress: (season: LeagueSeason) => void;
}): React.ReactNode {
  const startDate = formatSeasonDate(season.started_at);
  const endDate = formatSeasonDate(season.ended_at);
  const content = (
    <View
      testID={`season-row-${season.id}`}
      className="flex-row items-center px-4 py-[12px] border-b border-divider gap-3"
    >
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-default">
          {season.name || 'Untitled Season'}
        </Text>
        <Text className="text-[12px] text-muted">
          {startDate} - {endDate} · {season.session_count}{' '}
          {season.session_count === 1 ? 'session' : 'sessions'} · {season.game_count}{' '}
          {season.game_count === 1 ? 'game' : 'games'}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
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
        {isAdmin && <Text className="text-[14px] text-brand-teal">Edit</Text>}
      </View>
    </View>
  );

  if (isAdmin) {
    return (
      <Pressable
        testID={`season-row-pressable-${season.id}`}
        onPress={() => onPress(season)}
        className="active:opacity-70"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

// ---------------------------------------------------------------------------
// Home court pill
// ---------------------------------------------------------------------------

interface CourtPillProps {
  readonly court: HomeCourtResponse;
  readonly isPrimary: boolean;
  readonly isAdmin: boolean;
  readonly onRemove: (courtId: number) => Promise<void>;
}

function CourtPill({ court, isPrimary, isAdmin, onRemove }: CourtPillProps): React.ReactNode {
  return (
    <View
      testID={`court-pill-${court.id}`}
      className="flex-row items-center gap-1 bg-elevated rounded-full px-3 py-[6px] border border-divider"
    >
      {isPrimary && (
        <Text className="text-[11px] text-brand-teal">★</Text>
      )}
      <Text className="text-[12px] font-semibold text-default">{court.name}</Text>
      {isAdmin && (
        <Pressable
          testID={`remove-court-btn-${court.id}`}
          onPress={() => {
            void hapticLight();
            void onRemove(court.id);
          }}
          hitSlop={8}
          className="ml-1 active:opacity-60"
        >
          <Text className="text-[12px] text-muted">×</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Option picker modal (for access type / level)
// ---------------------------------------------------------------------------

interface OptionPickerModalProps<T extends string> {
  readonly visible: boolean;
  readonly title: string;
  readonly options: ReadonlyArray<{ label: string; value: T }>;
  readonly selected: T | null;
  readonly onSelect: (value: T) => Promise<void>;
  readonly onClose: () => void;
}

function OptionPickerModal<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: OptionPickerModalProps<T>): React.ReactNode {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="bg-surface rounded-t-[20px] px-4 pt-4 pb-8">
        <Text className="text-[16px] font-bold text-default mb-3">{title}</Text>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            testID={`option-${opt.value}`}
            onPress={() => {
              void onSelect(opt.value);
              onClose();
            }}
            className="flex-row justify-between items-center py-[14px] border-b border-divider"
          >
            <Text className="text-[14px] text-default">{opt.label}</Text>
            {selected === opt.value && (
              <Text className="text-[14px] text-brand-teal font-bold">✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Info row (label + value, with optional admin edit trigger)
// ---------------------------------------------------------------------------

interface InfoRowProps {
  readonly label: string;
  readonly value: string | null;
  readonly isAdmin?: boolean;
  readonly onPress?: () => void;
  readonly testID?: string;
}

function InfoRow({ label, value, isAdmin, onPress, testID }: InfoRowProps): React.ReactNode {
  if (value == null && !isAdmin) return null;
  const content = (
    <View
      testID={testID}
      className={`flex-row items-start px-4 py-[12px] border-b border-divider gap-4 ${
        isAdmin && onPress ? 'active:opacity-70' : ''
      }`}
    >
      <Text className="w-[110px] text-[12px] text-muted flex-shrink-0">
        {label}
      </Text>
      <Text className="flex-1 text-[13px] font-semibold text-default">
        {value ?? '—'}
      </Text>
      {isAdmin && onPress && (
        <Text className="text-[12px] text-brand-teal">Edit</Text>
      )}
    </View>
  );

  if (isAdmin && onPress) {
    return (
      <Pressable onPress={onPress}>
        {content}
      </Pressable>
    );
  }
  return content;
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
  const router = useRouter();
  const bottomContentPadding = useBottomTabBarContentPadding();
  const {
    info,
    isLoading,
    isError,
    onRetry,
    currentPlayerId,
    onApproveRequest,
    onDenyRequest,
    onLeaveLeague,
    onChangeRole,
    onRemovePlayer,
    onUpdateDescription,
    onUpdateAccess,
    onUpdateLevel,
    onAddCourt,
    onRemoveCourt,
    onCreateSeason,
    onUpdateSeason,
  } = useLeagueInfoTab(leagueId);

  const [leavePending, setLeavePending] = useState(false);

  // Description edit state
  const [editingDescription, setEditingDescription] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  // Picker modals
  const [showAccessPicker, setShowAccessPicker] = useState(false);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [showCourtPicker, setShowCourtPicker] = useState(false);
  const [seasonSheetMode, setSeasonSheetMode] = useState<'create' | 'edit' | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<LeagueSeason | null>(null);

  // Courts available for the picker (loaded lazily from getCourts)
  const [availableCourts, setAvailableCourts] = useState<Array<{ id: number; name: string }>>([]);

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

  const handleDescriptionEdit = (): void => {
    setDescDraft(info?.description ?? '');
    setEditingDescription(true);
  };

  const handleDescriptionSave = async (): Promise<void> => {
    setEditingDescription(false);
    const trimmed = descDraft.trim();
    if (trimmed !== (info?.description ?? '')) {
      await onUpdateDescription(trimmed);
    }
  };

  const handleAddCourtPress = async (): Promise<void> => {
    // No location ⇒ skip the API call; backend would receive `?location_id=` (empty
    // string) and return an unfiltered list, which is not what the picker should show.
    if (!info?.location_id) {
      setAvailableCourts([]);
      setShowCourtPicker(true);
      return;
    }
    try {
      const courts = await api.getCourts({ location_id: info.location_id });
      const normalized = Array.isArray(courts) ? courts : (courts as { items: typeof courts }).items ?? [];
      setAvailableCourts(
        (normalized as Array<{ id: number | string; name: string }>).map((c) => ({
          id: Number(c.id),
          name: c.name,
        })),
      );
    } catch {
      setAvailableCourts([]);
    }
    setShowCourtPicker(true);
  };

  const handleNewSeason = (): void => {
    setSelectedSeason(null);
    setSeasonSheetMode('create');
  };

  const handleSeasonPress = (season: LeagueSeason): void => {
    setSelectedSeason(season);
    setSeasonSheetMode('edit');
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
        <Text className="text-[13px] text-muted text-center mt-2">
          Check your connection and try again.
        </Text>
        <Pressable
          testID="info-retry-button"
          onPress={() => {
            void onRetry();
          }}
          accessibilityRole="button"
          accessibilityLabel="Retry loading league info"
          className="min-h-touch mt-4 px-5 items-center justify-center rounded-[10px] bg-brand-teal active:opacity-80"
        >
          <Text className="text-[14px] font-semibold text-white">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const pendingRequests = info.join_requests.filter((r) => r.status === 'pending');
  const accessLabel = info.access_type === 'open' ? 'Public' : 'Invite Only';
  const primaryCourt = info.home_courts[0] ?? null;
  const currentMember =
    currentPlayerId == null
      ? null
      : info.members.find((member) => member.player_id === currentPlayerId) ?? null;
  const isAdmin = userRole === 'admin' && currentMember?.role !== 'member';

  const levelOptions = LEVEL_OPTIONS.map((l) => ({ label: l, value: l }));

  return (
    <>
      <ScrollView
        testID="info-tab"
        className="flex-1 bg-page"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomContentPadding }}
      >
      {/* Description */}
      {(info.description != null || isAdmin) && (
        <>
          <SectionLabel title="Description" />
          <View className="bg-surface rounded-[12px] mx-4 border border-divider px-4 py-3">
            {editingDescription ? (
              <TextInput
                testID="description-input"
                value={descDraft}
                onChangeText={setDescDraft}
                onBlur={() => { void handleDescriptionSave(); }}
                multiline
                autoFocus
                className="text-[14px] text-default leading-[1.5] min-h-[60px]"
                placeholder="Add a description…"
              />
            ) : (
              <Pressable
                testID="description-edit-btn"
                onPress={isAdmin ? handleDescriptionEdit : undefined}
              >
                <Text className="text-[14px] text-default leading-[1.5]">
                  {info.description ?? (isAdmin ? 'Tap to add a description…' : '')}
                </Text>
                {isAdmin && (
                  <Text className="text-[11px] text-brand-teal mt-1">
                    {info.description != null ? 'Tap to edit' : ''}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </>
      )}

      {/* Join Requests (admin only) */}
      {isAdmin && pendingRequests.length > 0 && (
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
              <MemberRow
                key={m.player_id}
                member={m}
                isAdmin={isAdmin}
                isSelf={currentPlayerId === m.player_id}
                onChangeRole={onChangeRole}
                onRemovePlayer={onRemovePlayer}
              />
            ))}
          </View>
        </>
      )}

      {/* Seasons */}
      {(info.seasons.length > 0 || isAdmin) && (
        <>
          <View className="flex-row items-center justify-between pr-4">
            <SectionLabel title="Seasons" />
            {isAdmin && (
              <Pressable
                testID="new-season-btn"
                onPress={handleNewSeason}
                className="active:opacity-70"
              >
                <Text className="text-[13px] font-semibold text-brand-teal">+ New Season</Text>
              </Pressable>
            )}
          </View>
          {info.seasons.length > 0 && (
            <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden">
              {info.seasons.map((s) => (
                <SeasonRow
                  key={s.id}
                  season={s}
                  isAdmin={isAdmin}
                  onPress={handleSeasonPress}
                />
              ))}
            </View>
          )}
        </>
      )}

      {/* League Information */}
      <SectionLabel title="League Information" />
      <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden">
        <InfoRow
          testID="info-row-access"
          label="Access"
          value={accessLabel}
          isAdmin={isAdmin}
          onPress={isAdmin ? () => setShowAccessPicker(true) : undefined}
        />
        <InfoRow
          testID="info-row-level"
          label="Skill Level"
          value={info.level}
          isAdmin={isAdmin}
          onPress={isAdmin ? () => setShowLevelPicker(true) : undefined}
        />
        <InfoRow label="Location" value={info.location_name} />
        {/* Home Courts pill row */}
        <View className="px-4 py-[12px] border-b border-divider">
          <Text className="text-[12px] text-muted mb-2">Home Courts</Text>
          <View className="flex-row flex-wrap gap-2">
            {info.home_courts.length === 0 && (
              <Text
                testID="home-courts-empty"
                accessibilityRole="text"
                className="w-full text-[13px] text-muted"
              >
                {isAdmin
                  ? 'No home courts selected. Add one so players know where to meet.'
                  : 'No home courts selected yet.'}
              </Text>
            )}
            {info.home_courts.map((court) => (
              <CourtPill
                key={court.id}
                court={court}
                isPrimary={court.id === primaryCourt?.id}
                isAdmin={isAdmin}
                onRemove={onRemoveCourt}
              />
            ))}
            {isAdmin && (
              <Pressable
                testID="add-court-btn"
                onPress={() => { void handleAddCourtPress(); }}
                accessibilityRole="button"
                accessibilityLabel="Add a home court"
                className="flex-row items-center gap-1 bg-elevated rounded-full px-3 py-[6px] border border-dashed border-divider active:opacity-70"
              >
                <Text className="text-[12px] text-brand-teal font-semibold">+ Add Court</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Player invites are supported today; payment settings are intentionally
          omitted until the app has a real backend contract for them. */}
      {isAdmin && (
        <>
          <SectionLabel title="Invites" />
          <Pressable
            testID="invite-players-btn"
            onPress={() => {
              void hapticLight();
              router.push(routes.leagueInvite(leagueId));
            }}
            accessibilityRole="button"
            accessibilityLabel="Invite players to this league"
            className="min-h-touch bg-surface rounded-[12px] mx-4 border border-divider px-4 py-4 flex-row items-center active:opacity-70"
          >
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-default">
                Invite Players
              </Text>
              <Text className="text-[12px] text-muted mt-1">
                Send league invitations to eligible players.
              </Text>
            </View>
            <Text className="text-[18px] text-brand-teal" importantForAccessibility="no">
              ›
            </Text>
          </Pressable>
        </>
      )}

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

      {/* Keep modal lists outside the vertical ScrollView. A FlatList mounted
          below a same-direction ScrollView triggers React Native's nested
          VirtualizedList warning even though Modal renders in a portal. */}
      <OptionPickerModal
        visible={showAccessPicker}
        title="Access Type"
        options={ACCESS_OPTIONS}
        selected={info.access_type}
        onSelect={onUpdateAccess}
        onClose={() => setShowAccessPicker(false)}
      />
      <OptionPickerModal
        visible={showLevelPicker}
        title="Skill Level"
        options={levelOptions}
        selected={info.level}
        onSelect={onUpdateLevel}
        onClose={() => setShowLevelPicker(false)}
      />
      <CourtPickerModal
        visible={showCourtPicker}
        courts={availableCourts}
        onSelect={(courtId) => courtId == null ? undefined : onAddCourt(courtId)}
        onClose={() => setShowCourtPicker(false)}
        title="Add Home Court"
        testIDPrefix="court"
        modalTestID="court-picker-modal"
        closeTestID="close-court-picker"
      />
      <SeasonFormSheet
        visible={seasonSheetMode != null}
        mode={seasonSheetMode ?? 'create'}
        season={selectedSeason}
        onClose={() => {
          setSeasonSheetMode(null);
          setSelectedSeason(null);
        }}
        onSubmit={(payload) =>
          seasonSheetMode === 'edit' && selectedSeason != null
            ? onUpdateSeason(selectedSeason.id, payload)
            : onCreateSeason(payload)
        }
      />
    </>
  );
}
