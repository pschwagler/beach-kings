/**
 * SessionBottomSheet — iOS-style action sheet triggered by the ··· menu button.
 *
 * Active session options:
 *   1. Edit Session Details → routes.sessionEdit(id)
 *   2. Manage Players → routes.sessionRoster(id)
 *   3. Share Session (clipboard)
 *   4. Delete Session (destructive)
 *
 * Submitted session also surfaces (results are stable enough to copy/duplicate):
 *   5. Copy Results (clipboard)
 *   6. Duplicate as New Session
 *
 * Wireframe ref: session-menu.html
 */

import React, { useState } from "react";
import AppText from '@/components/ui/AppText';
import {
  View,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { hapticLight, hapticMedium } from "@/utils/haptics";
import { routes } from "@/lib/navigation";
import { pluralize } from "@/lib/formatters";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { reconcileGameMutation } from "@/features/matches";
import { shareSessionInvitation } from "@/features/sessions";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly sessionId: number;
  readonly sessionCode?: string | null;
  readonly leagueId?: number | null;
  readonly sessionLabel: string;
  readonly gameCount: number;
  readonly playerCount: number;
  /**
   * Session status. Copy Results + Duplicate are hidden while active —
   * those actions only make sense once results are finalized.
   */
  readonly status: "active" | "submitted";
}

interface MenuItemProps {
  readonly label: string;
  readonly testID: string;
  readonly onPress: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly accessibilityHint?: string;
}

function MenuItem({
  label,
  testID,
  onPress,
  destructive = false,
  disabled = false,
  busy = false,
  accessibilityHint,
}: MenuItemProps): React.ReactNode {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy }}
      className="py-[16px] border-b border-divider"
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <AppText
        className={`text-[16px] font-semibold text-center ${
          destructive ? "text-danger" : "text-brand-teal"
        }`}
      >
        {label}
      </AppText>
    </TouchableOpacity>
  );
}
export default function SessionBottomSheet({
  visible,
  onClose,
  sessionId,
  sessionCode = null,
  leagueId = null,
  sessionLabel,
  gameCount,
  playerCount,
  status,
}: Props): React.ReactNode {
  const isSubmitted = status === "submitted";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const handleEdit = async (): Promise<void> => {
    await hapticLight();
    onClose();
    router.push(routes.sessionEdit(sessionId));
  };

  const handleManagePlayers = async (): Promise<void> => {
    await hapticLight();
    onClose();
    router.push(routes.sessionRoster(sessionId));
  };

  const handleShare = async (): Promise<void> => {
    await hapticLight();
    setIsSharing(true);
    try {
      await shareSessionInvitation(sessionCode);
      onClose();
    } catch {
      Alert.alert(
        "Could not share session",
        sessionCode == null
          ? "This session does not have a share code yet. Refresh the session and try again."
          : "The share sheet could not be opened. Please try again.",
        [{ text: "OK" }],
      );
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyResults = async (): Promise<void> => {
    await hapticLight();
    onClose();
    // TODO(backend): format and copy results to clipboard
  };

  const handleDuplicate = async (): Promise<void> => {
    await hapticLight();
    onClose();
    // TODO(backend): duplicate session
  };

  const handleDelete = async (): Promise<void> => {
    await hapticMedium();
    Alert.alert(
      "Delete Session",
      "This will permanently delete the session and all its games. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const response = await api.deleteSession(sessionId);
              void reconcileGameMutation(queryClient, {
                userId,
                leagueId,
                statsJobs: response,
              });
              onClose();
              router.replace(routes.addGames());
            } catch {
              Alert.alert(
                "Could not delete session",
                "Something went wrong deleting this session. Please try again.",
                [{ text: "OK" }],
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="session-bottom-sheet-modal"
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onClose}
        testID="session-bottom-sheet-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Dismiss session menu"
      />
      <View
        testID="session-bottom-sheet"
        accessibilityViewIsModal
        className="bg-surface rounded-t-[20px] px-[16px] pb-[34px] pt-[8px]"
      >
        {/* Handle */}
        <View className="mb-[12px] h-[4px] w-[36px] self-center rounded-full bg-divider" />

        {/* Header */}
        <AppText className="text-[15px] font-bold text-default text-center mb-[2px]">
          {sessionLabel}
        </AppText>
        <AppText className="text-[12px] text-muted text-center mb-[16px]">
          {isSubmitted ? "Submitted" : "Active"} ·{" "}
          {pluralize(gameCount, "game")} · {pluralize(playerCount, "player")}
        </AppText>

        <MenuItem
          label="Edit Session Details"
          testID="session-menu-edit"
          onPress={() => {
            void handleEdit();
          }}
        />
        <MenuItem
          label={isSubmitted ? "View Players" : "Manage Players"}
          testID="session-menu-roster"
          onPress={() => {
            void handleManagePlayers();
          }}
        />
        <MenuItem
          label={isSharing ? "Opening Share..." : "Share Session"}
          testID="session-menu-share"
          onPress={() => {
            void handleShare();
          }}
          disabled={isSharing}
          busy={isSharing}
        />
        {isSubmitted && (
          <>
            <MenuItem
              label="Copy Results"
              testID="session-menu-copy-results"
              onPress={() => {
                void handleCopyResults();
              }}
            />
            <MenuItem
              label="Duplicate as New Session"
              testID="session-menu-duplicate"
              onPress={() => {
                void handleDuplicate();
              }}
            />
          </>
        )}
        <MenuItem
          label={isDeleting ? "Deleting..." : "Delete Session"}
          testID="session-menu-delete"
          onPress={() => {
            void handleDelete();
          }}
          destructive
          disabled={isDeleting}
          busy={isDeleting}
          accessibilityHint="Deletes this session and all of its games after confirmation"
        />

        <TouchableOpacity
          testID="session-menu-cancel"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="mt-[8px] py-[14px] rounded-[12px] border border-divider bg-elevated"
        >
          <AppText className="text-[15px] font-semibold text-muted text-center">
            Cancel
          </AppText>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
