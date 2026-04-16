/**
 * Debounces a value: returns the latest value only after `delay` ms have
 * elapsed since the last change. Useful for search inputs and other
 * high-frequency update scenarios.
 */
import { useState, useEffect } from 'react';

/** Default debounce delay in milliseconds. */
const DEFAULT_DELAY_MS = 300;

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * of inactivity.
 *
 * @param value - The value to debounce.
 * @param delay - Debounce delay in milliseconds. Default: 300.
 */
function useDebounce<T>(value: T, delay: number = DEFAULT_DELAY_MS): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
