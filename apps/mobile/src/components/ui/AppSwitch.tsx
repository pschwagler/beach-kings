/** Theme-aware switch shared by mobile settings and forms. */

import React from 'react';
import { Switch, type SwitchProps } from 'react-native';
import { usePaletteColors } from '@/theme/usePaletteColors';

export type AppSwitchProps = Omit<
  SwitchProps,
  'trackColor' | 'thumbColor' | 'ios_backgroundColor'
>;

export default function AppSwitch(props: AppSwitchProps): React.ReactNode {
  const palette = usePaletteColors();
  const { accessibilityState, disabled, ...switchProps } = props;

  return (
    <Switch
      {...switchProps}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ ...accessibilityState, disabled: disabled === true }}
      trackColor={{ false: palette.borderStrong, true: palette.brandTeal }}
      thumbColor={palette.bgSurface}
      ios_backgroundColor={palette.borderStrong}
    />
  );
}
