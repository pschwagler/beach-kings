import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
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
  readonly restoreFocusAfterDismissal: () => void;
} {
  const modalRef = useRef<View>(null);
  const visibleRef = useRef(visible);
  const restoredRef = useRef(false);
  const wasPresentedRef = useRef(visible);
  visibleRef.current = visible;

  const focusInitialElement = useCallback(() => {
    // Some test/native timing paths can deliver a stale show callback after
    // the owner has already hidden the modal. Never treat that as an opening.
    if (!visibleRef.current) return;
    wasPresentedRef.current = true;
    restoredRef.current = false;
    focusAccessibilityElement(initialFocusRef ?? modalRef);
  }, [initialFocusRef]);

  const restoreFocusAfterDismissal = useCallback(() => {
    if (!wasPresentedRef.current || restoredRef.current) return;
    wasPresentedRef.current = false;
    restoredRef.current = true;
    focusAccessibilityElement(returnFocusRef);
  }, [returnFocusRef]);

  useEffect(() => {
    if (visible) {
      wasPresentedRef.current = true;
      restoredRef.current = false;
    } else if (Platform.OS !== 'ios') {
      // React Native only emits Modal.onDismiss on iOS. On Android this
      // effect runs after the visible=false commit has removed the modal.
      restoreFocusAfterDismissal();
    }
  }, [restoreFocusAfterDismissal, visible]);

  return { modalRef, focusInitialElement, restoreFocusAfterDismissal };
}
