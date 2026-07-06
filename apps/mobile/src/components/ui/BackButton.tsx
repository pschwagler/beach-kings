import React from 'react';
import { Pressable } from 'react-native';
import { useBack } from '@/hooks/useBack';
import { ChevronLeftIcon } from './icons';

interface BackButtonProps {
  /**
   * Fully override the press handler. When provided, `useBack`'s derived
   * target is ignored.
   */
  readonly onPress?: () => void;
  readonly color?: string;
}

export default function BackButton({
  onPress,
  color = '#ffffff',
}: BackButtonProps): React.ReactNode {
  const handleBack = useBack();
  return (
    <Pressable
      className="min-w-touch min-h-touch items-center justify-center"
      onPress={onPress ?? handleBack}
      accessibilityLabel="Go back"
      accessibilityRole="button"
    >
      <ChevronLeftIcon size={20} color={color} />
    </Pressable>
  );
}
