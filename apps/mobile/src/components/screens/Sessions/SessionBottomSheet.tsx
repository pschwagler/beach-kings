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

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly sessionId: number;
  readonly sessionLabel: string;
  readonly gameCount: number;
  readonly playerCount: number;
  /**
   * Session status. Copy Results + Duplicate are hidden while active —
   * those actions only make sense once results are finalized.
   */
  readonly status: 'active' | 'submitted';
}

interface MenuItemProps {
  readonly label: string;
  readonly testID: string;
  readonly onPress: () => void;
  readonly destructive?: boolean;
}

function MenuItem({ label, testID, onPress, destructive = false }: MenuItemProps): React.ReactNode {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      className="py-[16px] border-b border-divider"
    >
      <Text
        className={`text-[16px] font-semibold text-center ${
          destructive ? 'text-danger' : 'text-brand-teal'
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function SessionBottomSheet({
  visible,
  onClose,
  sessionId,
  sessionLabel,
  gameCount,
  playerCount,
  status,
}: Props): React.ReactNode {
  const isSubmitted = status === 'submitted';
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

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
    onClose();
    // TODO(backend): generate and copy share link
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
      'Delete Session',
      'This will permanently delete the session and all its games. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await Promise.resolve(); // placeholder for api.deleteSession(sessionId)
              onClose();
              router.replace('/(tabs)/add-games');
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
      />
      <View
        testID="session-bottom-sheet"
        className="bg-surface rounded-t-[20px] px-[16px] pb-[34px] pt-[8px]"
      >
        {/* Handle */}
        <View className="w-[36px] h-[4px] bg-[#e0e0e0] rounded-full self-center mb-[12px]" />

        {/* Header */}
        <Text className="text-[15px] font-bold text-default text-center mb-[2px]">
          {sessionLabel}
        </Text>
        <Text className="text-[12px] text-muted text-center mb-[16px]">
          {isSubmitted ? 'Submitted' : 'Active'} · {gameCount} games · {playerCount} players
        </Text>

        <MenuItem
          label="Edit Session Details"
          testID="session-menu-edit"
          onPress={() => { void handleEdit(); }}
        />
        <MenuItem
          label="Manage Players"
          testID="session-menu-roster"
          onPress={() => { void handleManagePlayers(); }}
        />
        <MenuItem
          label="Share Session"
          testID="session-menu-share"
          onPress={() => { void handleShare(); }}
        />
        {isSubmitted && (
          <>
            <MenuItem
              label="Copy Results"
              testID="session-menu-copy-results"
              onPress={() => { void handleCopyResults(); }}
            />
            <MenuItem
              label="Duplicate as New Session"
              testID="session-menu-duplicate"
              onPress={() => { void handleDuplicate(); }}
            />
          </>
        )}
        <MenuItem
          label={isDeleting ? 'Deleting...' : 'Delete Session'}
          testID="session-menu-delete"
          onPress={() => { void handleDelete(); }}
          destructive
        />

        <TouchableOpacity
          testID="session-menu-cancel"
          onPress={onClose}
          className="mt-[8px] py-[14px] rounded-[12px] border border-divider bg-elevated"
        >
          <Text className="text-[15px] font-semibold text-muted text-center">
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
