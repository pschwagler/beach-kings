import React from 'react';
import { View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { usePaletteColors } from '@/theme/usePaletteColors';

type CourtLineMotifVariant = 'welcome' | 'home' | 'add-games';

interface CourtLineMotifProps {
  readonly variant: CourtLineMotifVariant;
  readonly testID?: string;
}

const VARIANT_CLASS: Readonly<Record<CourtLineMotifVariant, string>> = {
  welcome: 'absolute inset-0',
  home: 'absolute -right-12 -top-8 h-[190px] w-[250px]',
  'add-games': 'absolute -right-10 -top-10 h-[190px] w-[260px]',
};

/**
 * Code-native beach-court artwork used on the three approved brand moments.
 * It is deliberately decorative: it never participates in the accessibility
 * tree or intercepts a courtside tap.
 */
export default function CourtLineMotif({
  variant,
  testID = `court-line-motif-${variant}`,
}: CourtLineMotifProps): React.ReactNode {
  const palette = usePaletteColors();
  const isWelcome = variant === 'welcome';
  const lineColor = isWelcome ? palette.textInverse : palette.brandTeal;
  const accentColor = palette.brandGold;

  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={VARIANT_CLASS[variant]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 360 560"
        fill="none"
        accessible={false}
      >
        {/* Perspective court boundary: a crisp sideline geometry rather than
            generic decoration. */}
        <Path
          d="M38 548L137 216H223L322 548M82 404H278M109 314H251M38 548H322"
          stroke={lineColor}
          strokeWidth={isWelcome ? 2.4 : 3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isWelcome ? 0.18 : 0.11}
        />

        {/* Net, posts, and sparse mesh. */}
        <Line x1="72" y1="280" x2="288" y2="280" stroke={accentColor} strokeWidth="3" opacity={isWelcome ? 0.55 : 0.3} />
        <Line x1="76" y1="280" x2="76" y2="369" stroke={accentColor} strokeWidth="3" opacity={isWelcome ? 0.55 : 0.3} />
        <Line x1="284" y1="280" x2="284" y2="369" stroke={accentColor} strokeWidth="3" opacity={isWelcome ? 0.55 : 0.3} />
        {[302, 324, 346].map((y) => (
          <Line
            key={`net-horizontal-${y}`}
            x1="76"
            y1={y}
            x2="284"
            y2={y}
            stroke={lineColor}
            strokeWidth="1.5"
            opacity={isWelcome ? 0.12 : 0.08}
          />
        ))}
        {[111, 146, 180, 214, 249].map((x) => (
          <Line
            key={`net-vertical-${x}`}
            x1={x}
            y1="280"
            x2={x}
            y2="359"
            stroke={lineColor}
            strokeWidth="1.5"
            opacity={isWelcome ? 0.12 : 0.08}
          />
        ))}
      </Svg>
    </View>
  );
}
