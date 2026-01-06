import React, { ReactNode } from 'react';
import { Sheet, YStack, XStack, Text, Button as TamaguiButton } from 'tamagui';
import { X } from 'lucide-react-native';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  snapPoints?: number[];
}

export function Modal({ isOpen, onClose, title, children, snapPoints = [85] }: ModalProps) {
  return (
    <Sheet
      modal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      snapPoints={snapPoints}
      dismissOnSnapToBottom
      zIndex={100_000}
      animation="medium"
    >
      <Sheet.Overlay
        animation="lazy"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <Sheet.Handle />
      <Sheet.Frame
        padding="$4"
        backgroundColor="$background"
        borderTopLeftRadius="$6"
        borderTopRightRadius="$6"
      >
        {title && (
          <XStack
            alignItems="center"
            justifyContent="space-between"
            marginBottom="$4"
          >
            <Text fontSize="$7" fontWeight="700" color="$textPrimary">
              {title}
            </Text>
            <TamaguiButton
              size="$3"
              circular
              icon={X}
              onPress={onClose}
              backgroundColor="transparent"
              color="$textSecondary"
            />
          </XStack>
        )}
        <YStack flex={1}>
          {children}
        </YStack>
      </Sheet.Frame>
    </Sheet>
  );
}
