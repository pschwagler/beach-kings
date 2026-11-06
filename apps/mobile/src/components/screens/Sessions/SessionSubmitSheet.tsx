import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { SessionGame } from '@beach-kings/shared';
import Modal from '@/components/ui/Modal';
import AppText from '@/components/ui/AppText';
import SessionResultsTable from './SessionResultsTable';

interface Props {
  readonly visible: boolean;
  readonly games: readonly SessionGame[];
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Review every player's record before locking the session. */
export default function SessionSubmitSheet({ visible, games, onConfirm, onCancel }: Props): React.ReactNode {
  return (
    <Modal visible={visible} title="Submit session?" onClose={onCancel} testID="session-submit-confirm">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <AppText className="text-[14px] text-muted mb-4">
          Scores will be locked and ratings updated. This can&apos;t be undone.
        </AppText>
        <SessionResultsTable games={games} />
      </ScrollView>
      <View className="border-t border-divider bg-surface p-4 gap-2">
        <Pressable
          testID="session-submit-confirm-confirm"
          accessibilityRole="button"
          accessibilityLabel="Submit session"
          onPress={onConfirm}
          className="min-h-touch rounded-xl bg-brand-gold items-center justify-center px-4 py-3"
        >
          <AppText className="text-[15px] font-bold text-on-brand-gold">Submit Session</AppText>
        </Pressable>
        <Pressable
          testID="session-submit-confirm-cancel"
          accessibilityRole="button"
          onPress={onCancel}
          className="min-h-touch rounded-xl border border-divider items-center justify-center px-4 py-3"
        >
          <AppText className="text-[15px] font-semibold text-muted">Keep editing</AppText>
        </Pressable>
      </View>
    </Modal>
  );
}
