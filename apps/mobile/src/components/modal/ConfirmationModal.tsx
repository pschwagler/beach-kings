import React, { useState } from 'react';
import { YStack, XStack, Text, Button as TamaguiButton } from 'tamagui';
import { Trophy, Users } from 'lucide-react-native';
import { Modal } from '../ui/Modal';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  gameCount?: number;
  playerCount?: number;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  gameCount,
  playerCount,
}: ConfirmationModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Error during confirmation:', error);
      // Keep modal open on error
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <YStack gap="$4">
        {(gameCount !== undefined || playerCount !== undefined) && (
          <XStack gap="$4" alignItems="center">
            {gameCount !== undefined && (
              <XStack gap="$2" alignItems="center">
                <Trophy size={18} color="$oceanBlue" />
                <Text fontSize="$4" color="$textSecondary">
                  {gameCount} {gameCount === 1 ? 'game' : 'games'}
                </Text>
              </XStack>
            )}
            {playerCount !== undefined && (
              <XStack gap="$2" alignItems="center">
                <Users size={18} color="$oceanBlue" />
                <Text fontSize="$4" color="$textSecondary">
                  {playerCount} {playerCount === 1 ? 'player' : 'players'}
                </Text>
              </XStack>
            )}
          </XStack>
        )}

        <Text fontSize="$5" color="$textPrimary" lineHeight="$1">
          {message}
        </Text>

        <XStack gap="$3" marginTop="$2">
          <TamaguiButton
            flex={1}
            onPress={onClose}
            disabled={isSubmitting}
            backgroundColor="$gray200"
            color="$textPrimary"
            fontSize="$4"
            fontWeight="600"
          >
            {cancelText}
          </TamaguiButton>
          <TamaguiButton
            flex={1}
            onPress={handleConfirm}
            disabled={isSubmitting}
            backgroundColor="$oceanBlue"
            color="$textWhite"
            fontSize="$4"
            fontWeight="600"
            opacity={isSubmitting ? 0.6 : 1}
          >
            {isSubmitting ? 'Submitting...' : confirmText}
          </TamaguiButton>
        </XStack>
      </YStack>
    </Modal>
  );
}
