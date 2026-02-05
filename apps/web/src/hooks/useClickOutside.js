'use client';

import { useEffect } from 'react';

/**
 * Calls onClose when a mousedown happens outside ref.current while isActive is true.
 * @param {React.RefObject} ref - ref to the element (click inside = do not close)
 * @param {boolean} isActive - whether the listener is active
 * @param {function} onClose - called when click is outside
 */
export function useClickOutside(ref, isActive, onClose) {
  useEffect(() => {
    if (!isActive) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, isActive, onClose]);
}
