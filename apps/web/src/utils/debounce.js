import { useRef, useEffect, useCallback } from 'react';

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param {Function} func - The function to debounce
 * @param {number} wait - The number of milliseconds to delay
 * @returns {Function} The debounced function
 */
export function debounce(func, wait) {
  let timeout;
  
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * React hook version of debounce that returns a debounced callback.
 * The callback is stable across renders and will be cleaned up on unmount.
 * 
 * @param {Function} callback - The function to debounce
 * @param {number} delay - The number of milliseconds to delay
 * @returns {Function} The debounced callback
 */
export function useDebounce(callback, delay) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);
  
  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);
}



