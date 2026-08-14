/**
 * Canonical mobile text primitive.
 *
 * Barlow is embedded natively, so this component never blocks rendering to
 * load fonts. It deliberately preserves React Native's default scaling
 * behavior and every Text prop; callers may opt into the condensed display
 * face for headings, wordmarks, and large scores.
 */

import React, { forwardRef } from 'react';
import {
  Text as NativeText,
  type Text as NativeTextInstance,
  type TextProps,
  type TextStyle,
} from 'react-native';
import {
  fontWeights,
  nativeFontFamily,
  typography,
  type TypographyVariant,
} from '@beach-kings/shared/tokens/typography';

export type AppTextFamily = keyof typeof nativeFontFamily;
export type AppTextWeight = keyof typeof fontWeights;

export interface AppTextProps extends TextProps {
  readonly variant?: TypographyVariant;
  readonly family?: AppTextFamily;
  readonly weight?: AppTextWeight;
}

const AppText = forwardRef<NativeTextInstance, AppTextProps>(function AppText(
  {
    variant,
    family = 'sans',
    weight,
    style,
    ...textProps
  },
  ref,
) {
  const variantStyle = variant == null
    ? undefined
    : (typography[variant] as TextStyle);
  const weightStyle = weight == null
    ? undefined
    : ({ fontWeight: fontWeights[weight] } as TextStyle);

  return (
    <NativeText
      ref={ref}
      {...textProps}
      style={[
        { fontFamily: nativeFontFamily[family] },
        variantStyle,
        weightStyle,
        style,
      ]}
    />
  );
});

export default AppText;
