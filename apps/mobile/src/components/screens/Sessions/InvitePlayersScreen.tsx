/**
 * InvitePlayersScreen — share invite links for placeholder/unclaimed players.
 *
 * Reusable across pickup and league sessions; pure-prop component so it stays
 * independently testable. The route file reads its params from
 * {@link useInvitePlayers} and forwards them here.
 *
 * Behavior:
 *   - Tap a row or its Send button → OS share sheet via `Share.share`
 *   - After share resolves or rejects → show "Sent ✓" for ~3s, then revert
 *   - Presses while a row is in the Sent state are swallowed (no double-share)
 *
 * Wireframe ref: mobile-audit/wireframes/session-invite-players.html
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import Avatar from '@/components/ui/Avatar';
import { CheckIcon } from '@/components/ui/icons';
import { useBack } from '@/hooks/useBack';
import { usePaletteColors } from '@/theme/usePaletteColors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default share message — overridden via `shareMessageTemplate` prop. */
const DEFAULT_TEMPLATE =
  'Hey {firstName}, claim your Beach League profile so the games we played together count toward your stats: {url}';

/** Sent ✓ revert duration. */
const SENT_REVERT_MS = 3_000;

const EMPTY_TITLE_DEFAULT = 'All players on Beach League';
const EMPTY_SUBTITLE =
  'Everyone in this session already has an account, so all games count automatically.';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvitePlayersParams {
  readonly title?: string;
  readonly contextLabel: string;
  readonly contextSubLabel?: string;
  readonly players: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly initials: string;
    readonly metaLabel: string;
    readonly inviteUrl: string;
  }>;
  readonly shareMessageTemplate?: string;
  readonly emptyStateCopy?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Render a share-message template, substituting `{firstName}` (first word of
 * the player name) and `{url}` (the invite URL). Templates may contain neither
 * or both placeholders.
 */
export function renderTemplate(
  template: string,
  player: { readonly name: string; readonly inviteUrl: string },
): string {
  const firstName = player.name.split(' ')[0] ?? player.name;
  return template
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{url\}/g, player.inviteUrl);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface InviteRowProps {
  readonly player: InvitePlayersParams['players'][number];
  readonly isSent: boolean;
  readonly onSend: () => void;
}

function InviteRow({
  player,
  isSent,
  onSend,
}: InviteRowProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <TouchableOpacity
      testID={`invite-row-${player.id}`}
      onPress={onSend}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Send invite to ${player.name}`}
      className="flex-row items-center bg-surface border border-divider rounded-[14px] p-[12px] mx-[16px] mb-[10px]"
    >
      <View className="mr-[12px]">
        <Avatar
          name={player.name}
          size={48}
          colorSeed={player.id}
          accessible={false}
        />
      </View>

      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-default">
          {player.name}
        </Text>
        <Text className="text-[12px] text-muted mt-[2px]">
          {player.metaLabel}
        </Text>
      </View>

      {isSent ? (
        <View
          testID={`invite-sent-indicator-${player.id}`}
          className="flex-row items-center bg-success-tint rounded-full px-[12px] py-[8px]"
        >
          <CheckIcon size={14} color={palette.success} />
          <Text className="text-[13px] font-semibold text-success ml-[4px]">
            Sent
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          testID={`invite-send-btn-${player.id}`}
          onPress={onSend}
          accessibilityRole="button"
          accessibilityLabel={`Send invite to ${player.name}`}
          className="bg-brand-teal rounded-full px-[14px] py-[8px]"
        >
          <Text className="text-[13px] font-semibold text-white">Send</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

interface EmptyStateProps {
  readonly title: string;
  readonly onBack: () => void;
}

function EmptyState({ title, onBack }: EmptyStateProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View className="flex-1 items-center justify-center px-[32px] py-[48px]">
      <View className="w-[80px] h-[80px] rounded-full items-center justify-center mb-[20px] bg-success-tint">
        <CheckIcon size={34} color={palette.success} />
      </View>
      <Text className="text-[20px] font-bold text-default text-center">
        {title}
      </Text>
      <Text className="text-[14px] text-muted text-center mt-[8px] leading-[20px]">
        {EMPTY_SUBTITLE}
      </Text>
      <TouchableOpacity
        testID="invite-empty-back-btn"
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="bg-brand-teal rounded-full px-[28px] py-[12px] mt-[24px]"
      >
        <Text className="text-[14px] font-semibold text-white">Back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function InvitePlayersScreen({
  title = 'Invite Players',
  contextLabel,
  contextSubLabel,
  players,
  shareMessageTemplate,
  emptyStateCopy = EMPTY_TITLE_DEFAULT,
}: InvitePlayersParams): React.ReactNode {
  const handleBack = useBack();
  const [sentIds, setSentIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  // Track outstanding revert timers so unmount cleans them up. Map preserves
  // independence: re-sending the same row replaces its own timer only.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Synchronous guard against double-fire: state updates are async, so two
  // rapid taps would both read a stale `sentIds`. The ref is updated inline.
  const sentRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  const markSent = useCallback((id: string) => {
    setSentIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      sentRef.current.delete(id);
      setSentIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      timersRef.current.delete(id);
    }, SENT_REVERT_MS);
    timersRef.current.set(id, t);
  }, []);

  const handleSend = useCallback(
    async (player: InvitePlayersParams['players'][number]) => {
      // Synchronous guard — immune to the async-state race two rapid taps hit.
      if (sentRef.current.has(player.id)) return;
      sentRef.current.add(player.id);
      const message = renderTemplate(
        shareMessageTemplate ?? DEFAULT_TEMPLATE,
        player,
      );
      try {
        await Share.share({ message, url: player.inviteUrl });
      } catch {
        // User cancellation surfaces as a rejection on some platforms — still
        // show the Sent ✓ indicator per spec.
      }
      markSent(player.id);
    },
    [markSent, shareMessageTemplate],
  );

  const isEmpty = players.length === 0;

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="invite-players-screen"
    >
      <TopNav
        title={title}
        showBack
      />

      {isEmpty ? (
        <EmptyState title={emptyStateCopy} onBack={handleBack} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
          testID="invite-players-scroll"
        >
          {/* Context strip */}
          <View className="mx-[16px] bg-elevated rounded-[12px] px-[14px] py-[12px] mb-[16px]">
            <Text className="text-[14px] font-semibold text-default">
              {contextLabel}
            </Text>
            {contextSubLabel != null && contextSubLabel.length > 0 && (
              <Text className="text-[12px] text-muted mt-[2px]">
                {contextSubLabel}
              </Text>
            )}
          </View>

          {/* Intro */}
          <View className="mx-[16px] mb-[16px]">
            <Text className="text-[16px] font-bold text-default">
              Send them a link to claim their games
            </Text>
            <Text className="text-[13px] text-muted mt-[4px] leading-[18px]">
              When a player claims their profile, the games you recorded
              together count toward both of your stats and rankings.
            </Text>
          </View>

          {/* Section label */}
          <View className="flex-row items-center justify-between mx-[16px] mb-[10px]">
            <Text className="text-[12px] font-bold uppercase text-muted tracking-wider">
              Unclaimed players
            </Text>
            <Text className="text-[12px] font-bold text-muted">
              {players.length}
            </Text>
          </View>

          {/* List */}
          {players.map((p) => (
            <InviteRow
              key={p.id}
              player={p}
              isSent={sentIds.has(p.id)}
              onSend={() => { void handleSend(p); }}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
