import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
} from 'react-native';

type BrandSurface = 'light' | 'dark';

interface SharedBrandImageProps {
  readonly surface: BrandSurface;
  readonly accessibilityLabel?: string;
  readonly accessible?: boolean;
  readonly testID?: string;
  readonly style?: StyleProp<ImageStyle>;
}

interface BrandMarkProps extends SharedBrandImageProps {
  readonly size: number;
}

interface BrandLockupProps extends SharedBrandImageProps {
  readonly width: number;
}

const MARK_SOURCES: Readonly<Record<BrandSurface, ImageSourcePropType>> = {
  light: require('../../../assets/brand/marks/mark-on-light-256.png'),
  dark: require('../../../assets/brand/marks/mark-on-dark-256.png'),
};

const LOCKUP_SOURCES: Readonly<Record<BrandSurface, ImageSourcePropType>> = {
  light: require('../../../assets/brand/lockups/lockup-on-light-640.png'),
  dark: require('../../../assets/brand/lockups/lockup-on-dark-640.png'),
};

const LOCKUP_ASPECT_RATIO: Readonly<Record<BrandSurface, number>> = {
  light: 640 / 170,
  dark: 640 / 176,
};

export function BrandMark({
  surface,
  size,
  accessibilityLabel = 'Beach League',
  accessible = true,
  testID,
  style,
}: BrandMarkProps): React.ReactNode {
  return (
    <Image
      source={MARK_SOURCES[surface]}
      resizeMode="contain"
      accessible={accessible}
      accessibilityRole={accessible ? 'image' : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      testID={testID}
      style={[{ width: size, height: size }, style]}
    />
  );
}

export function BrandLockup({
  surface,
  width,
  accessibilityLabel = 'Beach League',
  accessible = true,
  testID,
  style,
}: BrandLockupProps): React.ReactNode {
  return (
    <Image
      source={LOCKUP_SOURCES[surface]}
      resizeMode="contain"
      accessible={accessible}
      accessibilityRole={accessible ? 'image' : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      testID={testID}
      style={[
        { width, height: width / LOCKUP_ASPECT_RATIO[surface] },
        style,
      ]}
    />
  );
}
