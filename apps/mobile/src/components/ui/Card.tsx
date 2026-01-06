import React, { ReactNode } from 'react';
import { YStack, XStack, YStackProps, XStackProps } from 'tamagui';

interface CardProps extends YStackProps {
  children: ReactNode;
  onPress?: () => void;
}

export function Card({ children, onPress, ...props }: CardProps) {
  return (
    <YStack
      backgroundColor="$backgroundLight"
      borderRadius="$4"
      padding="$4"
      marginBottom="$3"
      borderWidth={1}
      borderColor="$borderLight"
      pressStyle={onPress ? { opacity: 0.8, scale: 0.98 } : undefined}
      onPress={onPress}
      cursor={onPress ? 'pointer' : 'default'}
      {...props}
    >
      {children}
    </YStack>
  );
}

interface CardHeaderProps extends YStackProps {
  children: ReactNode;
}

export function CardHeader({ children, ...props }: CardHeaderProps) {
  return (
    <YStack marginBottom="$3" {...props}>
      {children}
    </YStack>
  );
}

interface CardContentProps extends YStackProps {
  children: ReactNode;
}

export function CardContent({ children, ...props }: CardContentProps) {
  return (
    <YStack {...props}>
      {children}
    </YStack>
  );
}

interface CardFooterProps extends XStackProps {
  children: ReactNode;
}

export function CardFooter({ children, ...props }: CardFooterProps) {
  return (
    <XStack marginTop="$3" {...props}>
      {children}
    </XStack>
  );
}


