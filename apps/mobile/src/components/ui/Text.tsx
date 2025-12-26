import { Text as TamaguiText, styled } from 'tamagui';

/**
 * Custom Text component with default font family
 * Extends Tamagui Text with sensible defaults for the app
 * Uses Tamagui's styled API which automatically handles refs
 */
export const Text = styled(TamaguiText, {
  name: 'Text',
  fontFamily: '$body',
});


