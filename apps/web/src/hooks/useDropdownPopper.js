import { useEffect, useRef } from 'react';
import { createPopper } from '@popperjs/core';

/**
 * Custom hook to manage Popper.js instance for dropdown positioning
 * @param {boolean} isOpen - Whether the dropdown is open
 * @param {React.RefObject} referenceRef - Ref to the reference element (input)
 * @param {React.RefObject} popperRef - Ref to the popper element (dropdown)
 * @returns {React.RefObject} - Ref to the Popper instance
 */
export function useDropdownPopper(isOpen, referenceRef, popperRef) {
  const popperInstanceRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !referenceRef.current || !popperRef.current) {
      // Cleanup popper if it exists
      if (popperInstanceRef.current) {
        popperInstanceRef.current.destroy();
        popperInstanceRef.current = null;
      }
      return;
    }

    // Calculate max height based on available space
    const calculateMaxHeight = () => {
      const rect = referenceRef.current.getBoundingClientRect();
      const viewportHeight = window.visualViewport 
        ? window.visualViewport.height 
        : window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 8; // 8px padding
      return Math.max(150, Math.min(300, spaceBelow));
    };

    // Set initial max-height
    if (popperRef.current) {
      popperRef.current.style.maxHeight = `${calculateMaxHeight()}px`;
    }

    // Create Popper instance
    popperInstanceRef.current = createPopper(referenceRef.current, popperRef.current, {
      placement: 'bottom-start',
      strategy: 'fixed',
      modifiers: [
        {
          name: 'flip',
          enabled: false, // Always show below, never flip above
        },
        {
          name: 'preventOverflow',
          enabled: false, // Disable - let it overflow and use CSS max-height instead
        },
        {
          name: 'offset',
          options: {
            offset: [0, 4], // 4px gap below input
          },
        },
        {
          name: 'computeStyles',
          options: {
            adaptive: true, // Adapt to viewport changes
            gpuAcceleration: false, // Better for mobile
          },
        },
      ],
    });

    // Update on scroll/resize
    const updatePopper = () => {
      if (popperInstanceRef.current) {
        popperInstanceRef.current.update();
        
        // Also update max-height when viewport changes
        if (popperRef.current && referenceRef.current) {
          const rect = referenceRef.current.getBoundingClientRect();
          const viewportHeight = window.visualViewport 
            ? window.visualViewport.height 
            : window.innerHeight;
          const spaceBelow = viewportHeight - rect.bottom - 8;
          const maxHeight = Math.max(150, Math.min(300, spaceBelow));
          popperRef.current.style.maxHeight = `${maxHeight}px`;
        }
      }
    };

    window.addEventListener('scroll', updatePopper, true);
    window.addEventListener('resize', updatePopper);
    
    // Also listen to visual viewport changes (for mobile keyboard)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updatePopper);
      window.visualViewport.addEventListener('scroll', updatePopper);
    }

    return () => {
      window.removeEventListener('scroll', updatePopper, true);
      window.removeEventListener('resize', updatePopper);
      
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updatePopper);
        window.visualViewport.removeEventListener('scroll', updatePopper);
      }
      
      if (popperInstanceRef.current) {
        popperInstanceRef.current.destroy();
        popperInstanceRef.current = null;
      }
    };
  }, [isOpen, referenceRef, popperRef]);

  return popperInstanceRef;
}






