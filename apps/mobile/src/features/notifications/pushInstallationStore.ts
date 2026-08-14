import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { PushPlatform } from '@beach-kings/shared';
import { api } from '@/lib/api';

const INSTALLATION_KEY = 'beachleague.push.installation.v1';
const SOFT_ASK_PREFIX = 'beachleague.push.soft-ask.v1.';

export type SoftAskChoice = 'allowed' | 'not_now';

export interface PendingUnregister {
  readonly installationId: string;
  readonly unregisterSecret: string;
}

export interface PushInstallationState {
  readonly installationId: string;
  readonly token?: string;
  readonly platform?: PushPlatform;
  readonly projectId?: string;
  readonly registeredUserId?: number;
  readonly unregisterSecret?: string;
  readonly registeredAt?: string;
  readonly pendingUnregister?: PendingUnregister;
}

async function writeState(state: PushInstallationState): Promise<void> {
  await SecureStore.setItemAsync(INSTALLATION_KEY, JSON.stringify(state));
}

export async function getPushInstallationState(): Promise<PushInstallationState> {
  const raw = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw) as Partial<PushInstallationState>;
      if (typeof parsed.installationId === 'string') {
        return parsed as PushInstallationState;
      }
    } catch {
      // Replace malformed local metadata without touching server data.
    }
  }
  const state: PushInstallationState = { installationId: Crypto.randomUUID() };
  await writeState(state);
  return state;
}

export async function savePushRegistration(input: {
  readonly token: string;
  readonly platform: PushPlatform;
  readonly projectId: string;
  readonly userId: number;
  readonly unregisterSecret: string;
}): Promise<PushInstallationState> {
  const current = await getPushInstallationState();
  const next: PushInstallationState = {
    installationId: current.installationId,
    token: input.token,
    platform: input.platform,
    projectId: input.projectId,
    registeredUserId: input.userId,
    unregisterSecret: input.unregisterSecret,
    registeredAt: new Date().toISOString(),
  };
  await writeState(next);
  return next;
}

export async function retryPendingPushUnregister(): Promise<boolean> {
  const current = await getPushInstallationState();
  if (current.pendingUnregister == null) return true;
  try {
    await api.unregisterPushInstallation({
      installation_id: current.pendingUnregister.installationId,
      unregister_secret: current.pendingUnregister.unregisterSecret,
    });
    await writeState({ installationId: current.installationId });
    return true;
  } catch {
    return false;
  }
}

/** Retire the old account's registration before its auth/cache transition. */
export async function retirePushInstallation(): Promise<void> {
  const current = await getPushInstallationState();
  if (
    current.token == null ||
    current.platform == null ||
    current.unregisterSecret == null
  ) {
    return;
  }
  try {
    await api.unregisterPushInstallation({
      installation_id: current.installationId,
      unregister_secret: current.unregisterSecret,
    });
    await writeState({ installationId: current.installationId });
  } catch {
    await writeState({
      installationId: current.installationId,
      pendingUnregister: {
        installationId: current.installationId,
        unregisterSecret: current.unregisterSecret,
      },
    });
  }
}

export async function getSoftAskChoice(userId: number): Promise<SoftAskChoice | null> {
  const value = await SecureStore.getItemAsync(`${SOFT_ASK_PREFIX}${userId}`);
  return value === 'allowed' || value === 'not_now' ? value : null;
}

export async function setSoftAskChoice(
  userId: number,
  choice: SoftAskChoice,
): Promise<void> {
  await SecureStore.setItemAsync(`${SOFT_ASK_PREFIX}${userId}`, choice);
}
