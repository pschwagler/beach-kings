import React from 'react';
import { Pressable, View } from 'react-native';
import AppText from '@/components/ui/AppText';
import BottomSheet from '@/components/ui/BottomSheet';

interface Props {
  readonly visible: boolean;
  readonly playerName: string;
  readonly blockedByViewer: boolean;
  readonly onViewProfile?: () => void;
  readonly onRemoveFriend?: () => void;
  readonly onConversationVisibility?: () => void;
  readonly conversationHidden?: boolean;
  readonly onBlockChange: () => void;
  readonly onReport: () => void;
  readonly onClose: () => void;
}

export default function PlayerSafetySheet(props: Props): React.ReactNode {
  const action = (label: string, onPress: () => void, destructive = false, testID?: string) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-[56px] items-center justify-center border-b border-divider px-lg"
    >
      <AppText className={`text-[17px] font-semibold ${destructive ? 'text-danger' : 'text-default'}`}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} className="pb-2xl" testID="player-action-sheet">
      <View accessibilityViewIsModal onAccessibilityEscape={props.onClose}>
        <View className="items-center px-lg py-md border-b border-divider">
          <AppText accessibilityRole="header" className="text-sm font-bold text-default">
            {props.playerName}
          </AppText>
        </View>
        {props.onViewProfile != null && action('View profile', props.onViewProfile)}
        {props.onConversationVisibility != null && action(
          props.conversationHidden ? 'Restore conversation' : 'Hide conversation',
          props.onConversationVisibility,
          false,
          'action-sheet-conversation-visibility',
        )}
        {props.onRemoveFriend != null && action('Remove friend', props.onRemoveFriend, true, 'action-sheet-remove-friend')}
        {action(props.blockedByViewer ? 'Unblock player' : 'Block player', props.onBlockChange, !props.blockedByViewer, 'action-sheet-block')}
        {action('Report player', props.onReport, true, 'action-sheet-report')}
        <Pressable
          testID="action-sheet-cancel"
          onPress={props.onClose}
          accessibilityRole="button"
          className="min-h-[56px] items-center justify-center px-lg"
        >
          <AppText className="text-[17px] font-semibold text-brand-teal">Cancel</AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
