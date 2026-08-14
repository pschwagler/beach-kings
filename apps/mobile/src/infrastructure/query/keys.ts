/**
 * Top-level TanStack Query namespaces.
 *
 * Anything whose response can vary by the signed-in account must be nested
 * under `privateKeys.user(userId)`. Public catalog data lives under
 * `publicKeys` and may be shared across account transitions.
 */
export const privateKeys = {
  root: ['private'] as const,
  user: (userId: number) => [...privateKeys.root, userId] as const,
} as const;

export const publicKeys = {
  root: ['public'] as const,
  locations: () => [...publicKeys.root, 'locations'] as const,
} as const;
