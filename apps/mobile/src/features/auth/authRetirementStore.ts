import * as SecureStore from "expo-secure-store";

const AUTH_RETIRED_KEY = "beachleague.auth.retired.v1";

let desiredRetired: boolean | null = null;
let retirementGeneration = 0;

async function persistDesiredRetirement(
  retired: boolean,
  generation: number,
): Promise<void> {
  if (retired) {
    await SecureStore.setItemAsync(AUTH_RETIRED_KEY, "1");
  } else {
    await SecureStore.deleteItemAsync(AUTH_RETIRED_KEY);
  }

  // Repair an obsolete native completion. This matters when an account-A
  // write resumes after account B, or a delayed activation resumes after a
  // newer logout.
  if (generation !== retirementGeneration && desiredRetired != null) {
    if (desiredRetired) {
      await SecureStore.setItemAsync(AUTH_RETIRED_KEY, "1");
    } else {
      await SecureStore.deleteItemAsync(AUTH_RETIRED_KEY);
    }
  }
}

/** Mark stored credentials unusable before best-effort deletion begins. */
export function markAuthRetired(): Promise<void> {
  desiredRetired = true;
  retirementGeneration += 1;
  return persistDesiredRetirement(true, retirementGeneration);
}

/** Clear the marker only after replacement credentials were durably written. */
export function activatePersistedAuth(): Promise<void> {
  desiredRetired = false;
  retirementGeneration += 1;
  return persistDesiredRetirement(false, retirementGeneration);
}

export async function isAuthRetired(): Promise<boolean> {
  if (desiredRetired != null) return desiredRetired;
  desiredRetired = (await SecureStore.getItemAsync(AUTH_RETIRED_KEY)) === "1";
  return desiredRetired;
}

/** Reset process-local coordination between isolated Jest cases. */
export function __resetAuthRetirementStoreForTests(): void {
  if (process.env.NODE_ENV !== "test") return;
  desiredRetired = null;
  retirementGeneration = 0;
}
