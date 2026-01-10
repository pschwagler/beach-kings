import React from 'react';
import { Pressable } from 'react-native';
import { XStack, useTheme } from 'tamagui';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from './Text';

interface HeaderProps {
  onBack: () => void;
  title?: string;
}

export function Header({ onBack, title = 'Beach League' }: HeaderProps) {
  const theme = useTheme();

  return (
    <XStack
      padding="$4"
      paddingTop="$2"
      paddingBottom="$3"
      alignItems="center"
      justifyContent="space-between"
      borderBottomWidth={1}
      borderBottomColor="$border"
      backgroundColor="$background"
      minHeight={60}
    >
      <Pressable onPress={onBack}>
        <XStack alignItems="center" gap="$2">
          <ChevronLeft size={20} color={theme.textSecondary.val} />
          <Text fontSize={16} color="$textSecondary">
            Back
          </Text>
        </XStack>
      </Pressable>
      <Text fontSize={18} fontWeight="600" color="$primaryDark">
        {title}
      </Text>
      <XStack minWidth={80} />
    </XStack>
  );
}

