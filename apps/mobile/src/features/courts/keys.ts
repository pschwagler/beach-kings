import { privateKeys, publicKeys } from '@/infrastructure/query/keys';

export const courtKeys = {
  public: () => [...publicKeys.root, 'courts'] as const,
  reviewTags: () => [...courtKeys.public(), 'review-tags'] as const,
  all: (userId: number) => [...privateKeys.user(userId), 'courts'] as const,
  nearby: (
    userId: number,
    latitude: number | null,
    longitude: number | null,
    locationId: string | null,
  ) => [
    ...courtKeys.all(userId),
    'nearby',
    latitude,
    longitude,
    locationId,
  ] as const,
  catalog: (
    userId: number,
    latitude: number | null,
    longitude: number | null,
  ) => [...courtKeys.all(userId), 'catalog', latitude, longitude] as const,
  placeholder: (userId: number, locationId: string) =>
    [...courtKeys.all(userId), 'placeholder', locationId] as const,
  detail: (userId: number, idOrSlug: number | string) =>
    [...courtKeys.all(userId), 'detail', String(idOrSlug)] as const,
  photos: (userId: number, idOrSlug: number | string) =>
    [...courtKeys.detail(userId, idOrSlug), 'photos'] as const,
} as const;
