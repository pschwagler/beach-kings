'use client';

import { useEffect, RefObject } from 'react';

/**
 * Calls onClose when a mousedown happens outside ref.current while isActive is true.
 * @param ref - ref to the element (click inside = do not close)
 * @param isActive - whether the listener is active
 * @param onClose - called when click is outside
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  isActive: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isActive) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, isActive, onClose]);
}
