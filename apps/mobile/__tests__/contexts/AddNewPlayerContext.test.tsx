/**
 * Tests for AddNewPlayerContext — the bridge between the score screen and the
 * add-new-player formSheet route.
 *
 * Covers: setRequest/clearRequest, setResult, consumeResult (returns then nulls,
 * idempotent), and the throwing hook guard outside a provider.
 */

import React from 'react';
import { Text } from 'react-native';
import { render, renderHook, act } from '@testing-library/react-native';

import AddNewPlayerProvider, {
  useAddNewPlayer,
  type AddNewPlayerRequest,
  type AddNewPlayerResult,
} from '@/contexts/AddNewPlayerContext';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REQUEST: AddNewPlayerRequest = {
  team: 1,
  slot: 0,
  prefillName: 'Brad K',
  inferredGender: 'male',
  inferredLevel: 'advanced',
  leagueId: 3,
};

const RESULT: AddNewPlayerResult = {
  team: 2,
  slot: 1,
  name: 'Brad K',
  player_id: 99,
  invite_url: 'https://x/invite/tok',
};

function wrapper({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <AddNewPlayerProvider>{children}</AddNewPlayerProvider>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAddNewPlayer', () => {
  it('throws when used outside an AddNewPlayerProvider', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    expect(() => renderHook(() => useAddNewPlayer())).toThrow(
      'useAddNewPlayer must be used within an AddNewPlayerProvider',
    );
    consoleError.mockRestore();
  });
});

describe('AddNewPlayerProvider — request', () => {
  it('starts with a null request', () => {
    const { result } = renderHook(() => useAddNewPlayer(), { wrapper });
    expect(result.current.request).toBeNull();
  });

  it('setRequest stores the request', () => {
    const { result } = renderHook(() => useAddNewPlayer(), { wrapper });

    act(() => {
      result.current.setRequest(REQUEST);
    });

    expect(result.current.request).toEqual(REQUEST);
  });

  it('clearRequest resets the request to null', () => {
    const { result } = renderHook(() => useAddNewPlayer(), { wrapper });

    act(() => {
      result.current.setRequest(REQUEST);
    });
    act(() => {
      result.current.clearRequest();
    });

    expect(result.current.request).toBeNull();
  });
});

describe('AddNewPlayerProvider — result', () => {
  it('starts with a null result', () => {
    const { result } = renderHook(() => useAddNewPlayer(), { wrapper });
    expect(result.current.result).toBeNull();
  });

  it('setResult stores the result', () => {
    const { result } = renderHook(() => useAddNewPlayer(), { wrapper });

    act(() => {
      result.current.setResult(RESULT);
    });

    expect(result.current.result).toEqual(RESULT);
  });

  it('consumeResult returns the pending result and clears it', () => {
    const { result } = renderHook(() => useAddNewPlayer(), { wrapper });

    act(() => {
      result.current.setResult(RESULT);
    });

    let consumed: AddNewPlayerResult | null = null;
    act(() => {
      consumed = result.current.consumeResult();
    });

    expect(consumed).toEqual(RESULT);
    expect(result.current.result).toBeNull();
  });

  it('consumeResult is idempotent — a second call returns null', () => {
    const { result } = renderHook(() => useAddNewPlayer(), { wrapper });

    act(() => {
      result.current.setResult(RESULT);
    });

    act(() => {
      result.current.consumeResult();
    });

    let second: AddNewPlayerResult | null = RESULT;
    act(() => {
      second = result.current.consumeResult();
    });

    expect(second).toBeNull();
  });

  it('consumeResult returns null when nothing is pending', () => {
    const { result } = renderHook(() => useAddNewPlayer(), { wrapper });

    let consumed: AddNewPlayerResult | null = RESULT;
    act(() => {
      consumed = result.current.consumeResult();
    });

    expect(consumed).toBeNull();
  });
});

describe('AddNewPlayerProvider — children', () => {
  it('renders children', () => {
    const { getByText } = render(
      <AddNewPlayerProvider>
        <Text>child content</Text>
      </AddNewPlayerProvider>,
    );
    expect(getByText('child content')).toBeTruthy();
  });
});
