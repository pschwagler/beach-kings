import type { DevelopmentAuthExtension } from './authExtension.types';

/** Production build stub. The development implementation is not in the graph. */
export function useDevelopmentAuthExtension(
  _dependencies: unknown,
): Partial<DevelopmentAuthExtension> {
  return {};
}
