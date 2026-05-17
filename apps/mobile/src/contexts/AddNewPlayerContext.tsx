/**
 * Bridge context for the "Add New Player" formSheet route.
 *
 * The score screen and the `add-new-player` route are sibling screens in the
 * `(stack)` navigator, so they cannot pass props/callbacks directly. This
 * context carries the request *into* the sheet (which slot, prefill, inferred
 * defaults) and the created player *back out* once the sheet dismisses.
 *
 * Lives at the `(stack)` layout level so both routes can reach it.
 */

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
} from 'react';
import type { PlayerGender, SkillLevel } from '@beach-kings/shared';

/** What the score screen hands the sheet when the user taps "Add New Player". */
export interface AddNewPlayerRequest {
  readonly team: 1 | 2;
  readonly slot: 0 | 1;
  /** Raw search query captured at open time, e.g. "Brad K". */
  readonly prefillName: string;
  readonly inferredGender: PlayerGender | null;
  readonly inferredLevel: SkillLevel | null;
  readonly leagueId: number | null;
}

/** What the sheet hands back after successfully creating a placeholder. */
export interface AddNewPlayerResult {
  readonly team: 1 | 2;
  readonly slot: 0 | 1;
  readonly name: string;
  readonly player_id: number;
  readonly invite_url: string;
}

interface AddNewPlayerContextValue {
  readonly request: AddNewPlayerRequest | null;
  readonly result: AddNewPlayerResult | null;
  readonly setRequest: (req: AddNewPlayerRequest) => void;
  readonly clearRequest: () => void;
  readonly setResult: (res: AddNewPlayerResult) => void;
  /** Returns the pending result and clears it in one step (idempotent). */
  readonly consumeResult: () => AddNewPlayerResult | null;
}

const AddNewPlayerContext = createContext<AddNewPlayerContextValue | null>(
  null,
);

/**
 * Access the add-new-player bridge.
 * Must be used within an {@link AddNewPlayerProvider}.
 */
export function useAddNewPlayer(): AddNewPlayerContextValue {
  const context = useContext(AddNewPlayerContext);
  if (!context) {
    throw new Error(
      'useAddNewPlayer must be used within an AddNewPlayerProvider',
    );
  }
  return context;
}

interface AddNewPlayerProviderProps {
  readonly children: React.ReactNode;
}

export default function AddNewPlayerProvider({
  children,
}: AddNewPlayerProviderProps): React.ReactNode {
  const [request, setRequestState] = useState<AddNewPlayerRequest | null>(
    null,
  );
  const [result, setResultState] = useState<AddNewPlayerResult | null>(null);
  // Mirrors `result` so `consumeResult` can return the current value
  // synchronously without depending on a re-render.
  const resultRef = useRef<AddNewPlayerResult | null>(null);

  const setRequest = useCallback((req: AddNewPlayerRequest) => {
    setRequestState(req);
  }, []);

  const clearRequest = useCallback(() => {
    setRequestState(null);
  }, []);

  const setResult = useCallback((res: AddNewPlayerResult) => {
    resultRef.current = res;
    setResultState(res);
  }, []);

  const consumeResult = useCallback((): AddNewPlayerResult | null => {
    const current = resultRef.current;
    resultRef.current = null;
    setResultState(null);
    return current;
  }, []);

  const value: AddNewPlayerContextValue = {
    request,
    result,
    setRequest,
    clearRequest,
    setResult,
    consumeResult,
  };

  return (
    <AddNewPlayerContext.Provider value={value}>
      {children}
    </AddNewPlayerContext.Provider>
  );
}
