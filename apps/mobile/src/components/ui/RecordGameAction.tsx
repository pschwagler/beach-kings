import React from 'react';
import { Pressable } from 'react-native';
import AppText from './AppText';

interface Props {
  readonly onPress: () => void;
  readonly description: string;
  readonly accessibilityHint: string;
  readonly testID?: string;
  readonly className?: string;
}

/** Shared gold action for beginning score entry on Home and league Games. */
export default function RecordGameAction({
  onPress,
  description,
  accessibilityHint,
  testID,
  className = '',
}: Props): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Record a Game"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      className={`min-h-touch rounded-card bg-brand-gold px-lg py-md active:opacity-80 ${className}`}
    >
      <AppText className="text-title3 font-bold text-on-brand-gold">Record a Game</AppText>
      <AppText className="mt-xxs text-caption text-on-brand-gold">{description}</AppText>
    </Pressable>
  );
}
