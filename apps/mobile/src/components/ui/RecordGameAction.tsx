import React from 'react';
import { Pressable } from 'react-native';
import AppText from './AppText';

interface Props {
  readonly disabled?: boolean;
  readonly label?: string;
  readonly onPress: () => void;
  readonly description: string;
  readonly accessibilityHint: string;
  readonly testID?: string;
  readonly className?: string;
}

/** Shared gold action for beginning score entry on Home and league Games. */
export default function RecordGameAction({
  label = 'Record a Game',
  disabled = false,
  onPress,
  description,
  accessibilityHint,
  testID,
  className = '',
}: Props): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      accessibilityState={{ disabled }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      className={`min-h-touch rounded-card bg-brand-gold px-lg py-md active:opacity-80 ${className}`}
    >
      <AppText className="text-title3 font-bold text-on-brand-gold">{label}</AppText>
      <AppText className="mt-xxs text-caption text-on-brand-gold">{description}</AppText>
    </Pressable>
  );
}
