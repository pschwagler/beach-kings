import { useRef } from 'react';

/**
 * Custom hook to handle touch selection with scroll detection
 * Distinguishes between taps and scrolls to prevent accidental selections
 * @param {Function} onSelect - Callback function to execute on valid tap
 * @returns {Object} - Object with handleTouchStart and handleTouchEnd functions
 */
export function useTouchSelection(onSelect) {
  const touchStartPos = useRef(null);

  const handleTouchStart = (e) => {
    touchStartPos.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchEnd = (e, item) => {
    if (!touchStartPos.current) return;
    
    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY
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






