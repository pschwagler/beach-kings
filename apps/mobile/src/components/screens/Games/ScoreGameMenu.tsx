/**
 * ScoreGameMenu — score-screen-specific action sheet behind the ··· button.
 *
 * Visual style mirrors `SessionBottomSheet` but the option set is the smaller
 * two-item list specified by `apps/mobile/MOBILE_ADD_GAMES_VALIDATION.md`:
 *   1. Manage Session   — always visible; lazily creates a session if none exists
 *   2. Share Session    — visible only after a session exists
 *
 * Deliberately NOT reusing `SessionBottomSheet` — the wireframe at
 * `mobile-audit/wireframes/score-scoreboard.html` shows six options, but the
 * validation doc (active product spec) overrides that with this shorter list.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onManageSession: () => void;
  readonly onShareSession: () => void;
  /** When false, the Share option is hidden (no session exists yet). */
  readonly canShare: boolean;
  /** Spinner-suppressed flag for the Manage Session row. */
  readonly isCreatingSession?: boolean;
}

interface MenuItemProps {
  readonly label: string;
  readonly testID: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

function MenuItem({
  label,
  testID,
  onPress,
  disabled = false,
}: MenuItemProps): React.ReactNode {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={`py-[16px] border-b border-divider ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <Text className="text-[16px] font-semibold text-center text-brand-teal">
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ScoreGameMenu({
  visible,
  onClose,
  onManageSession,
  onShareSession,
  canShare,
  isCreatingSession = false,
}: Props): React.ReactNode {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="score-game-menu-modal"
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onClose}
        testID="score-game-menu-backdrop"
      />
      <View
        testID="score-game-menu"
        className="bg-surface rounded-t-[20px] px-[16px] pb-[34px] pt-[8px]"
      >
        {/* Handle */}
        <View className="w-[36px] h-[4px] bg-[#e0e0e0] rounded-full self-center mb-[12px]" />

        <MenuItem
          label={isCreatingSession ? 'Creating session…' : 'Manage Session'}
          testID="score-menu-manage"
          onPress={onManageSession}
          disabled={isCreatingSession}
        />
        {canShare && (
          <MenuItem
            label="Share Session"
            testID="score-menu-share"
            onPress={onShareSession}
          />
        )}

        <TouchableOpacity
          testID="score-menu-cancel"
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
