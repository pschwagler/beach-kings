import { Input as TamaguiInput, styled } from 'tamagui';

/**
 * Custom Input component with default styling and font family
 * Extends Tamagui Input with sensible defaults for the app
 * Uses Tamagui's styled API which automatically handles refs
 */
export const Input = styled(TamaguiInput, {
  name: 'Input',
  fontFamily: '$body',
  fontSize: '$3',
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 10,
  minHeight: 38,
  backgroundColor: '$background',
  borderColor: '$border',
});


