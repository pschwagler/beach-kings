import React from 'react';
import { Pressable } from 'react-native';
import { useBack } from '@/hooks/useBack';
import { ChevronLeftIcon } from './icons';

interface BackButtonProps {
  /**
   * Route to navigate to when there is no back history (e.g. deep link entry).
   * When omitted, always calls `router.back()`.
   */
  readonly fallback?: string;
  /**
   * Fully override the press handler. When provided, `fallback` is ignored.
   */
  readonly onPress?: () => void;
  readonly color?: string;
}

export default function BackButton({
  fallback,
  onPress,
  color = '#ffffff',
}: BackButtonProps): React.ReactNode {
  const handleBack = useBack(fallback);
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
