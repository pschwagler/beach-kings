import React from 'react';
import { Text as TamaguiText, TextProps as TamaguiTextProps } from 'tamagui';
import { TextStyle } from 'react-native';

interface TextProps {
  children: React.ReactNode;
  style?: TextStyle;
  variant?: 'body' | 'heading' | 'caption' | 'label';
}

export function Text({ children, style, variant = 'body' }: TextProps) {
  // Map variant to Tamagui text props
  const getVariantProps = (): Partial<TamaguiTextProps> => {
    switch (variant) {
      case 'heading':
        return {
          fontSize: '$6',
          fontWeight: '700',
          lineHeight: 32,
          color: '$textPrimary',
        };
      case 'body':
        return {
          fontSize: '$4',
          lineHeight: 24,
          color: '$textPrimary',
        };
      case 'caption':
        return {
          fontSize: '$3',
          lineHeight: 20,
          color: '$textSecondary',
        };
      case 'label':
        return {
          fontSize: '$3',
          fontWeight: '600',
          lineHeight: 20,
          color: '$textPrimary',
        };
      default:
        return {
          fontSize: '$4',
          color: '$textPrimary',
        };
    }
  };

  return (
    <TamaguiText
      {...getVariantProps()}
      {...(style as any)}
    >
      {children}
    </TamaguiText>
  );
}
