/** Compact unread-count badge shared by navigation surfaces. */

import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { usePaletteColors } from '@/theme/usePaletteColors';
import AppText from './AppText';

interface UnreadBadgeProps {
  readonly count: number;
  readonly className?: string;
  readonly borderColor?: string;
  readonly testID?: string;
}

export default function UnreadBadge({
  count,
  className = '',
  borderColor,
  testID,
}: UnreadBadgeProps): React.ReactNode {
  const palette = usePaletteColors();

  if (count <= 0) return null;

  const borderStyle: ViewStyle | undefined = borderColor == null
    ? undefined
    : { borderColor, borderWidth: 2 };

  return (
    <View
      testID={testID}
      className={`min-w-[18px] min-h-[18px] rounded-full items-center justify-center px-1 ${className}`}
      style={[{ backgroundColor: palette.dangerFill }, borderStyle]}
    >
      <AppText
        className="text-[10px] font-bold leading-none"
        style={{ color: palette.onDanger }}
      >
        {count > 99 ? '99+' : count}
      </AppText>
    </View>
  );
}
