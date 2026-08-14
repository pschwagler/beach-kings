import { publicKeys } from '@/infrastructure/query/keys';

export const locationKeys = {
  all: () => publicKeys.locations(),
} as const;
