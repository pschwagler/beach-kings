/**
 * MessageThreadScreen — single DM conversation view.
 *
 * Renders:
 *   - list of sent/received messages, ordered newest-first (reversed to appear bottom-up)
 *   - date dividers
 *   - keyboard-avoiding input bar with send button
 *   - skeleton while loading
 *   - error state with retry on failure
 *
 * Wireframe ref: message-thread.html
 */

import React, { useCallback, useState } from "react";
import AppText from '@/components/ui/AppText';
import { AccessibilityInfo, View, Pressable, Alert } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Avatar from "@/components/ui/Avatar";
import ChatComposer from "@/components/ui/ChatComposer";
import ChatView from "@/components/ui/ChatView";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { useBack } from "@/hooks/useBack";
import { routes } from "@/lib/navigation";
import { useMessageThreadScreen } from "./useMessageThreadScreen";
import MessagesSkeleton from "./MessagesSkeleton";
import MessagesErrorState from "./MessagesErrorState";
import type { DirectMessage } from "@beach-kings/shared";
import { usePaletteColors } from '@/theme/usePaletteColors';
import ReportSheet from '@/components/moderation/ReportSheet';
import { useModerationMutations } from '@/features/moderation';
import BlockPlayerDialog from '@/components/moderation/BlockPlayerDialog';
import PlayerSafetySheet from '@/components/moderation/PlayerSafetySheet';
import UnblockPlayerDialog from '@/components/moderation/UnblockPlayerDialog';

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  readonly message: DirectMessage;
  readonly isOwn: boolean;
  readonly onReport: (id: number) => void;
}

function formatMsgTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function MessageBubble({
  message,
  isOwn,
  onReport,
}: MessageBubbleProps): React.ReactNode {
  return (
    <View className={`mb-3 px-4 ${isOwn ? "items-end" : "items-start"}`}>
      <Pressable
        onLongPress={() => onReport(message.id)}
        accessibilityHint="Long press for message actions"
        testID={`msg-bubble-${message.id}`}
        className={`max-w-[280px] px-[14px] py-[10px] rounded-2xl ${
          isOwn
            ? "bg-brand-teal rounded-br-sm"
            : "bg-surface rounded-bl-sm border border-divider"
        }`}
      >
        <AppText
          className={`text-[14px] leading-[1.4] ${
            isOwn ? "text-on-brand-teal" : "text-default"
          }`}
        >
          {message.message_text}
        </AppText>
        <AppText
          className={`text-[11px] mt-1 ${
            isOwn ? "text-on-brand-teal" : "text-muted"
          }`}
        >
          {formatMsgTime(message.created_at)}
          {message.moderation_visibility === 'pending' ? ' · Reviewing' : ''}
        </AppText>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Thread empty state
// ---------------------------------------------------------------------------

function ThreadEmptyState(): React.ReactNode {
  return (
    <View
      testID="thread-empty-state"
      className="flex-1 items-center justify-center px-8 py-16"
    >
      <AppText className="text-[14px] text-muted text-center">
        No messages yet. Say hello!
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface MessageThreadScreenProps {
  readonly playerId: number;
  readonly playerName: string;
  /** The current authenticated player's ID (for own-message detection). */
  readonly currentPlayerId: number;
}

export default function MessageThreadScreen({
  playerId,
  playerName,
  currentPlayerId,
}: MessageThreadScreenProps): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();
  const moderation = useModerationMutations();
  const [reportMessageId, setReportMessageId] = useState<number | null>(null);
  const [showPlayerReport, setShowPlayerReport] = useState(false);
  const [showSafetySheet, setShowSafetySheet] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showUnblockDialog, setShowUnblockDialog] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const handleBack = useBack();
  const insets = useSafeAreaInsets();
  const {
    messages,
    isLoading,
    error,
    isRefreshing,
    messageText,
    setMessageText,
    isSending,
    sendError,
    peerName,
    peerAvatarUrl,
    canInteract,
    blockedByViewer,
    onRefresh,
    onRetry,
    onSend,
  } = useMessageThreadScreen(playerId);

  const displayName =
    peerName ??
    (playerName != null && playerName.trim().length > 0 ? playerName : "Chat");

  const onProfile = useCallback(() => {
    router.push(routes.player(playerId));
  }, [router, playerId]);

  const onPlayerActions = useCallback(() => setShowSafetySheet(true), []);

  const onBlockChange = useCallback(() => {
    setShowSafetySheet(false);
    setSafetyError(null);
    if (blockedByViewer) setShowUnblockDialog(true);
    else setShowBlockDialog(true);
  }, [blockedByViewer]);

  const confirmBlock = useCallback(() => {
    setSafetyError(null);
    void moderation.block.mutateAsync({
      player_id: playerId,
      full_name: displayName,
      avatar: peerAvatarUrl,
    }).then(() => {
      setShowBlockDialog(false);
      AccessibilityInfo.announceForAccessibility(`${displayName} blocked.`);
      router.replace(routes.messagesList());
    }).catch(() => setSafetyError('Could not block this player. Please try again.'));
  }, [displayName, moderation.block, peerAvatarUrl, playerId, router]);

  const confirmUnblock = useCallback(() => {
    setSafetyError(null);
    void moderation.unblock.mutateAsync(playerId).then(() => {
      setShowUnblockDialog(false);
      AccessibilityInfo.announceForAccessibility(`${displayName} unblocked.`);
    }).catch(() => setSafetyError('Could not unblock this player. Please try again.'));
  }, [displayName, moderation.unblock, playerId]);

  const renderBody = (): React.ReactNode => {
    if (isLoading && !isRefreshing) {
      return <MessagesSkeleton count={4} />;
    }

    if (error != null && !isRefreshing) {
      return <MessagesErrorState onRetry={onRetry} />;
    }

    // API returns newest-first; ChatView expects oldest-first.
    const chronologicalMessages = [...messages].reverse();

    return (
      <ChatView<DirectMessage>
        testID="thread-screen"
        listTestID="messages-list"
        data={chronologicalMessages}
        keyExtractor={(msg) => `msg-${msg.id}`}
        renderBubble={(msg) => (
          <MessageBubble
            message={msg}
            isOwn={msg.sender_player_id === currentPlayerId}
            onReport={setReportMessageId}
          />
        )}
        getTimestamp={(msg) => msg.created_at}
        renderComposer={() => canInteract ? (
          <ChatComposer
            value={messageText}
            onChangeText={setMessageText}
            onSend={onSend}
            isSending={isSending}
            sendError={sendError}
            inputTestID="message-input"
            sendTestID="send-btn"
          />
        ) : (
          <View className="px-lg py-md border-t border-divider bg-surface">
            <AppText className="text-sm text-muted text-center">
              {blockedByViewer ? 'You blocked this player.' : "This interaction isn't available."}
            </AppText>
            {blockedByViewer && (
              <Pressable
                onPress={() => setShowUnblockDialog(true)}
                accessibilityRole="button"
                className="min-h-touch items-center justify-center mt-xs"
              >
                <AppText className="text-brand-teal font-bold">Unblock</AppText>
              </Pressable>
            )}
          </View>
        )}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        emptyState={<ThreadEmptyState />}
        bottomInset={insets.bottom}
      />
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      <View className="h-12 bg-nav flex-row items-center px-3 gap-2 border-b border-divider">
        <Pressable
          testID="thread-back-btn"
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Back to Messages"
          className="min-w-touch min-h-touch flex-row items-center"
        >
          <ChevronLeftIcon size={18} color={palette.textInverse} />
          <AppText className="text-inverse text-[15px] font-medium ml-0.5">
            Messages
          </AppText>
        </Pressable>

        <Avatar
          imageUrl={peerAvatarUrl}
          name={displayName}
          size="sm"
          colorSeed={playerId}
          className="ml-1"
        />

        <View className="flex-1 min-w-0">
          <AppText
            className="text-inverse text-[15px] font-bold"
            numberOfLines={2}
            accessibilityRole="header"
          >
            {displayName}
          </AppText>
        </View>

        <Pressable
          testID="thread-profile-btn"
          onPress={onPlayerActions}
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${displayName}`}
          className="min-h-touch items-end justify-center px-1"
        >
          <AppText className="text-inverse text-xl font-medium">•••</AppText>
        </Pressable>
      </View>
      {renderBody()}
      {reportMessageId != null && (
        <ReportSheet
          targetType="direct_message"
          targetId={reportMessageId}
          onClose={() => setReportMessageId(null)}
          onSubmitted={() => Alert.alert('Report received', 'Thank you for helping keep Beach League safe.')}
        />
      )}
      {showSafetySheet && (
        <PlayerSafetySheet
          visible
          playerName={displayName}
          blockedByViewer={blockedByViewer}
          onViewProfile={() => {
            setShowSafetySheet(false);
            onProfile();
          }}
          onBlockChange={onBlockChange}
          onReport={() => {
            setShowSafetySheet(false);
            setShowPlayerReport(true);
          }}
          onClose={() => setShowSafetySheet(false)}
        />
      )}
      {showPlayerReport && (
        <ReportSheet
          targetType="player"
          targetId={playerId}
          onClose={() => setShowPlayerReport(false)}
          onSubmitted={() => Alert.alert('Report received', 'Thank you for helping keep Beach League safe.')}
        />
      )}
      <BlockPlayerDialog
        visible={showBlockDialog}
        playerName={displayName}
        isPending={moderation.block.isPending}
        errorMessage={safetyError}
        onConfirm={confirmBlock}
        onCancel={() => setShowBlockDialog(false)}
      />
      <UnblockPlayerDialog
        visible={showUnblockDialog}
        playerName={displayName}
        isPending={moderation.unblock.isPending}
        errorMessage={safetyError}
        onConfirm={confirmUnblock}
        onCancel={() => setShowUnblockDialog(false)}
      />
    </SafeAreaView>
  );
}
