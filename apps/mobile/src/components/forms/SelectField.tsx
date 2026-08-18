import React, { forwardRef } from 'react';
import { Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';
import { ChevronDownIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface SelectFieldProps {
  readonly placeholder: string;
  readonly value: string;
  readonly error?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}

const SelectField = forwardRef<
  React.ElementRef<typeof Pressable>,
  SelectFieldProps
>(function SelectField(
  {
    placeholder,
    value,
    error = false,
    disabled = false,
    onPress,
    testID,
  },
  ref,
): React.ReactNode {
  const palette = usePaletteColors();
  const hasValue = !!value;
  return (
    <Pressable
      ref={ref}
      className={`h-12 px-md flex-row items-center justify-between rounded-lg border bg-surface ${
        error ? 'border-danger' : 'border-divider'
      } ${disabled ? 'opacity-50' : ''}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={hasValue ? value : placeholder}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <AppText
        className={`text-body flex-1 ${
          hasValue ? 'text-default' : 'text-tertiary'
        }`}
        numberOfLines={1}
      >
        {hasValue ? value : placeholder}
      </AppText>
      <ChevronDownIcon size={16} color={palette.textTertiary} />
    </Pressable>
  );
});

export default SelectField;
