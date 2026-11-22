import { createContext, useContext } from 'react';

export type NativePushAuthorization =
  | 'authorized'
  | 'denied'
  | 'not_determined'
  | 'unavailable';

export type EnablePushResult =
  | 'enabled'
  | 'not_enabled'
  | 'preference_failed';

export interface NativePushContextValue {
  readonly authorization: NativePushAuthorization;
  readonly enablePush: () => Promise<EnablePushResult>;
  readonly openSettings: () => Promise<void>;
  readonly isRegistering: boolean;
}

export const NativePushContext = createContext<NativePushContextValue | null>(null);

export function useNativePush(): NativePushContextValue {
  const value = useContext(NativePushContext);
  if (value == null) throw new Error('useNativePush must be used within NativePushProvider');
  return value;
}
