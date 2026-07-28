import { publicKeys } from '@/infrastructure/query/keys';

export const courtKeys = {
  all: () => [...publicKeys.root, 'courts'] as const,
  picker: (
    latitude: number | null,
    longitude: number | null,
  ) => [...courtKeys.all(), 'picker', latitude, longitude] as const,
} as const;
