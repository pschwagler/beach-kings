import { useRef } from 'react';
import React from 'react';

/**
 * Custom hook to handle touch selection with scroll detection
 * Distinguishes between taps and scrolls to prevent accidental selections
 * @param onSelect - Callback function to execute on valid tap
 * @returns Object with handleTouchStart and handleTouchEnd functions
 */
export function useTouchSelection<T = any>(onSelect: (item: T) => void) {
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent | TouchEvent) => {
    const touch = (e as TouchEvent).touches[0];
    touchStartPos.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent | TouchEvent, item: T) => {
    if (!touchStartPos.current) return;
    
    const changedTouch = (e as TouchEvent).changedTouches[0];
    const touchEnd = {
      x: changedTouch.clientX,
      y: changedTouch.clientY,
    };
    
    // Calculate distance moved
    const deltaX = Math.abs(touchEnd.x - touchStartPos.current.x);
    const deltaY = Math.abs(touchEnd.y - touchStartPos.current.y);
    
    // If moved less than 10px, it's a tap, not a scroll
    if (deltaX < 10 && deltaY < 10) {
      e.preventDefault();
      onSelect(item);
    }
    
    touchStartPos.current = null;
  };

  return { handleTouchStart, handleTouchEnd };
}
