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

import React, { useCallback } from "react";
import AppText from '@/components/ui/AppText';
import { View, Pressable } from "react-native";
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

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  readonly message: DirectMessage;
  readonly isOwn: boolean;
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
}: MessageBubbleProps): React.ReactNode {
  return (
    <View className={`mb-3 px-4 ${isOwn ? "items-end" : "items-start"}`}>
      <View
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
        </AppText>
      </View>
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
          />
        )}
        getTimestamp={(msg) => msg.created_at}
        renderComposer={() => (
          <ChatComposer
            value={messageText}
            onChangeText={setMessageText}
            onSend={onSend}
            isSending={isSending}
            sendError={sendError}
            inputTestID="message-input"
            sendTestID="send-btn"
          />
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
      <View className="h-12 bg-nav flex-row items-center px-3 gap-2 dark:border-b border-divider">
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
          onPress={onProfile}
          accessibilityRole="button"
          accessibilityLabel={`View ${displayName}'s profile`}
          className="min-h-touch items-end justify-center px-1"
        >
          <AppText className="text-inverse text-[14px] font-medium">Profile</AppText>
        </Pressable>
      </View>
      {renderBody()}
    </SafeAreaView>
  );
}
