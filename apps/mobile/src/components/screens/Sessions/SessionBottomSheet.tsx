/**
 * SessionBottomSheet — iOS-style action sheet triggered by the ··· menu button.
 *
 * Menu options:
 *   1. Edit Session Details → routes.sessionEdit(id)
 *   2. Manage Players → routes.sessionRoster(id)
 *   3. Share Session (clipboard)
 *   4. Copy Results (clipboard)
 *   5. Duplicate as New Session (TODO)
 *   6. Delete Session (destructive)
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
      className="py-[16px] border-b border-[#f0f0f0] dark:border-[#2a2a2a]"
    >
      <Text
        className={`text-[16px] font-semibold text-center ${
          destructive ? 'text-[#dc2626]' : 'text-[#1a3a4a] dark:text-content-primary'
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
}: Props): React.ReactNode {
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
        className="bg-white dark:bg-[#1a1a1a] rounded-t-[20px] px-[16px] pb-[34px] pt-[8px]"
      >
        {/* Handle */}
        <View className="w-[36px] h-[4px] bg-[#e0e0e0] rounded-full self-center mb-[12px]" />

        {/* Header */}
        <Text className="text-[15px] font-bold text-text-default dark:text-content-primary text-center mb-[2px]">
          {sessionLabel}
        </Text>
        <Text className="text-[12px] text-text-secondary dark:text-content-secondary text-center mb-[16px]">
          Active · {gameCount} games · {playerCount} players
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
        <MenuItem
          label={isDeleting ? 'Deleting...' : 'Delete Session'}
          testID="session-menu-delete"
          onPress={() => { void handleDelete(); }}
          destructive
        />

        <TouchableOpacity
          testID="session-menu-cancel"
          onPress={onClose}
          className="mt-[8px] py-[14px] rounded-[12px] border border-[#e0e0e0] dark:border-[#333] bg-[#f5f5f5] dark:bg-[#222]"
        >
          <Text className="text-[15px] font-semibold text-text-secondary dark:text-content-secondary text-center">
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
