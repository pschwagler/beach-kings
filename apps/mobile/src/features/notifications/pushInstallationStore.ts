import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { PushPlatform } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { completesWithin, settleWithin } from '@/features/auth/deadline';

const INSTALLATION_KEY = 'beachleague.push.installation.v1';
const SOFT_ASK_PREFIX = 'beachleague.push.soft-ask.v1.';
const PERSIST_CLEANUP_DEADLINE_MS = 1_000;
const UNREGISTER_DEADLINE_MS = 4_000;

let desiredState: PushInstallationState | null = null;
let stateGeneration = 0;

/** Reset process-local coordination between isolated Jest cases. */
export function __resetPushInstallationStoreForTests(): void {
  if (process.env.NODE_ENV !== 'test') return;
  desiredState = null;
  stateGeneration = 0;
}

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

/** Repair persistence if an obsolete native write completes after a newer one. */
async function persistState(
  state: PushInstallationState,
  generation: number,
): Promise<void> {
  await writeState(state);
  if (generation !== stateGeneration && desiredState != null) {
    await writeState(desiredState);
  }
}

function replaceDesiredState(state: PushInstallationState): {
  readonly state: PushInstallationState;
  readonly generation: number;
} {
  desiredState = state;
  stateGeneration += 1;
  return { state, generation: stateGeneration };
}

export async function getPushInstallationState(): Promise<PushInstallationState> {
  if (desiredState != null) return desiredState;
  const raw = await SecureStore.getItemAsync(INSTALLATION_KEY);
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw) as Partial<PushInstallationState>;
      if (typeof parsed.installationId === 'string') {
        desiredState = parsed as PushInstallationState;
        return desiredState;
      }
    } catch {
      // Replace malformed local metadata without touching server data.
    }
  }
  const state: PushInstallationState = { installationId: Crypto.randomUUID() };
  const update = replaceDesiredState(state);
  await persistState(update.state, update.generation);
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
  const update = replaceDesiredState(next);
  await persistState(update.state, update.generation);
  return next;
}

export async function retryPendingPushUnregister(): Promise<boolean> {
  const current = await getPushInstallationState();
  if (current.pendingUnregister == null) return true;
  const result = await settleWithin(
    api.unregisterPushInstallation({
      installation_id: current.pendingUnregister.installationId,
      unregister_secret: current.pendingUnregister.unregisterSecret,
    }),
    UNREGISTER_DEADLINE_MS,
  );
  if (
    result == null ||
    desiredState?.pendingUnregister !== current.pendingUnregister
  ) {
    return false;
  }
  const update = replaceDesiredState({ installationId: current.installationId });
  await persistState(update.state, update.generation);
  return true;
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
  // Store only the non-token retry credential before the network attempt.
  const pending: PushInstallationState = {
    installationId: current.installationId,
    pendingUnregister: {
      installationId: current.installationId,
      unregisterSecret: current.unregisterSecret,
    },
  };
  const retirement = replaceDesiredState(pending);
  await completesWithin(
    persistState(retirement.state, retirement.generation),
    PERSIST_CLEANUP_DEADLINE_MS,
  );

  const result = await settleWithin(
    api.unregisterPushInstallation({
      installation_id: current.installationId,
      unregister_secret: current.unregisterSecret,
    }),
    UNREGISTER_DEADLINE_MS,
  );
  if (result != null && stateGeneration === retirement.generation) {
    const cleared = replaceDesiredState({
      installationId: current.installationId,
    });
    await persistState(cleared.state, cleared.generation);
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
