import type { ModalProps } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

export function getModalAnimationType(
  reduceMotion: boolean,
): ModalProps['animationType'] {
  return reduceMotion ? 'none' : 'slide';
}

/** Uses the current OS Reduce Motion preference for custom native modals. */
export function useModalAnimationType(): ModalProps['animationType'] {
  return getModalAnimationType(useReducedMotion());
}
