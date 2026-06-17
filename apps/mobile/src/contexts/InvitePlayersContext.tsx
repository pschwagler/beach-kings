/**
 * Bridge context for the "Invite Players" screen.
 *
 * The session detail screen and the `invite-players` route are siblings in
 * the `(stack)` navigator, so they can't pass props directly. The detail
 * screen calls `setPending(params)` then navigates; the destination route
 * reads `pending` and renders the screen.
 *
 * Lives at the `(stack)` layout level so both routes can reach it.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

/** A single placeholder player to be invited. */
export interface InvitePlayerEntry {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly metaLabel: string;
  readonly inviteUrl: string;
}

/** Params shape mirrored on the screen — kept structural to avoid a circular import. */
export interface InvitePlayersPending {
  readonly title?: string;
  readonly contextLabel: string;
  readonly contextSubLabel?: string;
  readonly players: ReadonlyArray<InvitePlayerEntry>;
  readonly shareMessageTemplate?: string;
  readonly emptyStateCopy?: string;
}

interface InvitePlayersContextValue {
  readonly pending: InvitePlayersPending | null;
  readonly setPending: (p: InvitePlayersPending) => void;
  readonly clearPending: () => void;
}

const InvitePlayersContext = createContext<InvitePlayersContextValue | null>(
  null,
);

/**
 * Access the invite-players bridge.
 * Must be used within an {@link InvitePlayersProvider}.
 */
export function useInvitePlayers(): InvitePlayersContextValue {
  const ctx = useContext(InvitePlayersContext);
  if (!ctx) {
    throw new Error(
      'useInvitePlayers must be used within an InvitePlayersProvider',
    );
  }
  return ctx;
}

interface InvitePlayersProviderProps {
  readonly children: React.ReactNode;
}

export default function InvitePlayersProvider({
  children,
}: InvitePlayersProviderProps): React.ReactNode {
  const [pending, setPendingState] = useState<InvitePlayersPending | null>(
    null,
  );

  const setPending = useCallback((p: InvitePlayersPending) => {
    setPendingState(p);
  }, []);

  const clearPending = useCallback(() => {
    setPendingState(null);
  }, []);

  // Memoize so consumers don't re-render when the provider re-renders for
  // unrelated reasons (e.g. theme context propagating through the layout).
  const value = useMemo<InvitePlayersContextValue>(
    () => ({ pending, setPending, clearPending }),
    [pending, setPending, clearPending],
  );

  return (
    <InvitePlayersContext.Provider value={value}>
      {children}
    </InvitePlayersContext.Provider>
  );
}
