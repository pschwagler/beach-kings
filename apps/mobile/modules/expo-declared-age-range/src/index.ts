import { requireOptionalNativeModule } from 'expo-modules-core';

export type DeclaredAgeRangeResult =
  | { readonly status: 'unavailable' | 'declined' }
  | {
      readonly status: 'shared';
      readonly lowerBound?: number;
      readonly upperBound?: number;
      readonly declaration?: string;
      readonly activeParentalControls?: string;
      readonly eligibleForAgeFeatures?: boolean;
      readonly regulatoryFeatures?: readonly string[];
    };

interface NativeDeclaredAgeRange {
  requestAgeRangeAsync(gates: readonly number[]): Promise<DeclaredAgeRangeResult>;
}

const nativeModule =
  requireOptionalNativeModule<NativeDeclaredAgeRange>('ExpoDeclaredAgeRange');

export async function requestDeclaredAgeRange(
  minimumAge: 13 | 14,
): Promise<DeclaredAgeRangeResult> {
  if (!nativeModule) return { status: 'unavailable' };
  return nativeModule.requestAgeRangeAsync([minimumAge, 18]);
}
