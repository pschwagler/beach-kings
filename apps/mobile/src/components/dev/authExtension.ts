import { useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import type {
  DevelopmentAuthExtension,
  DevelopmentAuthTokens,
} from './authExtension.types';

type ResolvedIdentity = Awaited<ReturnType<typeof api.getMe>>;

interface DevelopmentAuthDependencies {
  readonly beginOperation: () => number;
  readonly prepareAuthentication: (revision: number) => Promise<boolean>;
  readonly enqueueTransition: <T>(work: () => Promise<T>) => Promise<T>;
  readonly isCurrentOperation: (revision: number) => boolean;
  readonly cancelQueryWork: () => Promise<void>;
  readonly clearQueryCache: () => void;
  readonly fetchProfileComplete: (userId: number) => Promise<boolean>;
  readonly publishIdentity: (
    identity: ResolvedIdentity,
    profileComplete: boolean,
  ) => void;
  readonly publishUnauthenticated: () => void;
}

/** Development build extension for securely importing simulator credentials. */
export function useDevelopmentAuthExtension({
  beginOperation,
  prepareAuthentication,
  enqueueTransition,
  isCurrentOperation,
  cancelQueryWork,
  clearQueryCache,
  fetchProfileComplete,
  publishIdentity,
  publishUnauthenticated,
}: DevelopmentAuthDependencies): DevelopmentAuthExtension {
  const importCredentialPair = useCallback(
    async (tokens: DevelopmentAuthTokens): Promise<void> => {
      const accessToken = tokens.accessToken.trim();
      const refreshToken = tokens.refreshToken.trim();
      if (!accessToken || !refreshToken) {
        throw new Error('Both development credentials are required');
      }

      const revision = beginOperation();
      if (!(await prepareAuthentication(revision))) return;

      const installed = await enqueueTransition(async () => {
        if (!isCurrentOperation(revision)) return false;
        await cancelQueryWork();
        if (!isCurrentOperation(revision)) return false;
        clearQueryCache();
        await api.setAuthTokens(accessToken, refreshToken);
        return isCurrentOperation(revision);
      });
      if (!installed) return;

      try {
        const identity = await api.getMe();
        if (!isCurrentOperation(revision)) return;
        const profileComplete = await fetchProfileComplete(identity.id);

        await enqueueTransition(async () => {
          if (isCurrentOperation(revision)) {
            publishIdentity(identity, profileComplete);
          }
        });
      } catch (error) {
        if (isCurrentOperation(revision)) {
          await enqueueTransition(async () => {
            if (!isCurrentOperation(revision)) return;
            await cancelQueryWork();
            if (!isCurrentOperation(revision)) return;
            try {
              await api.clearAuthTokens();
            } finally {
              if (isCurrentOperation(revision)) publishUnauthenticated();
            }
          });
        }
        throw error;
      }
    },
    [
      beginOperation,
      cancelQueryWork,
      clearQueryCache,
      enqueueTransition,
      fetchProfileComplete,
      isCurrentOperation,
      prepareAuthentication,
      publishIdentity,
      publishUnauthenticated,
    ],
  );

  return useMemo(
    () => ({ devLoginWithTokens: importCredentialPair }),
    [importCredentialPair],
  );
}
