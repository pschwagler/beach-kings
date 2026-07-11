/**
 * LeagueInfoTab — Info tab of the League Detail screen.
 *
 * Shows:
 *   Description (admin: inline edit, auto-save)
 *   Join Requests (admin only, approve/deny)
 *   Players (admin: role action sheet, remove button disabled for self)
 *   Seasons (admin: New Season stub)
 *   League Information (admin: Access/Level pickers auto-save; multi-court pill list)
 *   Invites & Payment placeholder
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
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { api } from '@/lib/api';
import { useLeagueInfoTab } from './useLeagueInfoTab';
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
          Started {startDate} · {season.session_count}{' '}
          {season.session_count === 1 ? 'session' : 'sessions'}
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
// Court picker modal
// ---------------------------------------------------------------------------

interface CourtPickerModalProps {
  readonly visible: boolean;
  readonly courts: Array<{ id: number; name: string }>;
  readonly onSelect: (courtId: number) => Promise<void>;
  readonly onClose: () => void;
}

function CourtPickerModal({
  visible,
  courts,
  onSelect,
  onClose,
}: CourtPickerModalProps): React.ReactNode {
  return (
    <Modal
      testID="court-picker-modal"
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onClose}
      />
      <View className="bg-surface rounded-t-[20px] px-4 pt-4 pb-8 max-h-[60%]">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-[16px] font-bold text-default">Add Home Court</Text>
          <Pressable testID="close-court-picker" onPress={onClose}>
            <Text className="text-[14px] text-brand-teal font-semibold">Done</Text>
          </Pressable>
        </View>
        <FlatList
          data={courts}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`court-option-${item.id}`}
              onPress={() => {
                void onSelect(item.id);
                onClose();
              }}
              className="py-[14px] border-b border-divider"
            >
              <Text className="text-[14px] text-default">{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
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
  const {
    info,
    isLoading,
    isError,
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
  } = useLeagueInfoTab(leagueId);

  const [leavePending, setLeavePending] = useState(false);

  // Description edit state
  const [editingDescription, setEditingDescription] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  // Picker modals
  const [showAccessPicker, setShowAccessPicker] = useState(false);
  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [showCourtPicker, setShowCourtPicker] = useState(false);

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
    Alert.alert('Coming Soon', 'Season management will be available in a future update.');
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
  const primaryCourt = info.home_courts[0] ?? null;
  const currentMember =
    currentPlayerId == null
      ? null
      : info.members.find((member) => member.player_id === currentPlayerId) ?? null;
  const isAdmin = userRole === 'admin' && currentMember?.role !== 'member';

  const levelOptions = LEVEL_OPTIONS.map((l) => ({ label: l, value: l }));

  return (
    <ScrollView
      testID="info-tab"
      className="flex-1 bg-page"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 32 }}
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
                <SeasonRow key={s.id} season={s} />
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
                className="flex-row items-center gap-1 bg-elevated rounded-full px-3 py-[6px] border border-dashed border-divider active:opacity-70"
              >
                <Text className="text-[12px] text-brand-teal font-semibold">+ Add Court</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Invites & Payment — placeholder */}
      <SectionLabel title="Invites & Payment" />
      <View className="bg-surface rounded-[12px] mx-4 border border-divider px-4 py-4">
        <View className="flex-row items-center gap-2">
          <View className="bg-brand-teal/10 rounded-[6px] px-2 py-[2px]">
            <Text className="text-[10px] font-bold text-brand-teal">Coming Soon</Text>
          </View>
          <Text className="text-[13px] text-muted">
            Invite management and payment settings
          </Text>
        </View>
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

      {/* Pickers */}
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
        onSelect={onAddCourt}
        onClose={() => setShowCourtPicker(false)}
      />
    </ScrollView>
  );
}
