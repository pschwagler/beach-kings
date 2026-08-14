import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  type View,
} from 'react-native';

export type AccessibilityFocusRef = React.RefObject<View | null>;

interface UseModalAccessibilityOptions {
  readonly visible: boolean;
  readonly initialFocusRef?: AccessibilityFocusRef;
  readonly returnFocusRef?: AccessibilityFocusRef;
}

function focusAccessibilityElement(ref: AccessibilityFocusRef | undefined): void {
  const target = ref?.current ?? null;
  const reactTag = typeof target === 'number' ? target : findNodeHandle(target);
  if (reactTag != null) {
    AccessibilityInfo.setAccessibilityFocus(reactTag);
  }
}

/**
 * Keeps screen-reader focus inside a native modal while it is open and gives
 * it back to the launching control after dismissal when the caller supplies
 * that control's ref.
 */
export function useModalAccessibility({
  visible,
  initialFocusRef,
  returnFocusRef,
}: UseModalAccessibilityOptions): {
  readonly modalRef: React.RefObject<View | null>;
  readonly focusInitialElement: () => void;
} {
  const modalRef = useRef<View>(null);
  const wasVisibleRef = useRef(false);

  const focusInitialElement = useCallback(() => {
    focusAccessibilityElement(initialFocusRef ?? modalRef);
  }, [initialFocusRef]);

  useEffect(() => {
    if (wasVisibleRef.current && !visible) {
      focusAccessibilityElement(returnFocusRef);
    }
    wasVisibleRef.current = visible;
  }, [returnFocusRef, visible]);

  return { modalRef, focusInitialElement };
}
