import { Input as TamaguiInput, styled } from 'tamagui';

/**
 * Custom Input component with default styling and font family
 * Extends Tamagui Input with sensible defaults for the app
 * Uses Tamagui's styled API which automatically handles refs
 */
export const Input = styled(TamaguiInput, {
  name: 'Input',
  fontFamily: '$body',
  fontSize: '$3', // base (16px) - 1rem
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderRadius: 10,
  minHeight: 44, // Ensures consistent height and good touch target
  backgroundColor: '$backgroundLight',
  borderColor: '$border',
});
