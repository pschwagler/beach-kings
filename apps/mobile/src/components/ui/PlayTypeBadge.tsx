import React from 'react';
import { View } from 'react-native';
import AppText from './AppText';

/** The same named, non-color-only league/pickup cue on cards and details. */
export default function PlayTypeBadge({
  type,
  noun,
}: {
  readonly type: 'league' | 'pickup';
  readonly noun?: 'game' | 'session';
}): React.ReactNode {
  const label = `${type === 'league' ? 'League' : 'Pickup'}${noun ? ` ${noun}` : ''}`;
  return (
    <View className={`self-start rounded-chip px-2 py-1 ${type === 'league' ? 'bg-info-tint' : 'bg-warning-tint'}`}>
      <AppText className={`text-[11px] font-semibold ${type === 'league' ? 'text-info' : 'text-warning'}`}>
        {label}
      </AppText>
    </View>
  );
}
