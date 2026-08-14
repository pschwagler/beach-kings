import React from 'react';
import { View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';

interface SectionErrorProps {
  readonly message?: string;
  readonly onRetry?: () => void;
}

export default function SectionError({
  message = 'Could not load this section.',
  onRetry,
}: SectionErrorProps): React.ReactNode {
  return (
    <View
      testID="section-error"
      className="bg-surface rounded-card p-lg items-center border border-danger-tint"
    >
      <AppText className="text-footnote text-muted text-center mb-sm">
        {message}
      </AppText>
      {onRetry != null && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading this section"
          className="bg-brand-teal rounded-chip px-md py-xs min-h-touch items-center justify-center"
        >
          <AppText className="text-on-brand-teal font-semibold text-footnote">
            Retry
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
