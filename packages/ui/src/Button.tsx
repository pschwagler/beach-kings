import React from 'react';
import { Button as TamaguiButton, ButtonProps as TamaguiButtonProps } from 'tamagui';
import { ViewStyle, TextStyle } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({ 
  title, 
  onPress, 
  variant = 'primary', 
  disabled = false,
  style,
  textStyle 
}: ButtonProps) {
  // Map variant to Tamagui button props
  const getVariantProps = (): Partial<TamaguiButtonProps> => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: '$oceanBlue',
          color: '$textWhite',
        };
      case 'secondary':
        return {
          backgroundColor: '$sunsetOrange',
          color: '$textWhite',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: '$oceanBlue',
          color: '$oceanBlue',
        };
      default:
        return {};
    }
  };

  return (
    <TamaguiButton
      onPress={onPress}
      disabled={disabled}
      py="$3"
      px="$6"
      borderRadius="$2"
      fontSize="$4"
      fontWeight="600"
      opacity={disabled ? 0.5 : 1}
      pressStyle={{ opacity: 0.8 }}
      {...getVariantProps()}
      {...(style as any)}
    >
      {title}
    </TamaguiButton>
  );
}


