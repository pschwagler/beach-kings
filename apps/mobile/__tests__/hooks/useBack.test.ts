/**
 * Tests for useBack — the shared back handler.
 *
 * Back is temporal (pop the stack) when there is history; only when the screen
 * is an entry point (no history) does it navigate to the route's "Up" target.
 */
import { renderHook } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = jest.fn(() => true);
let mockSegments: string[] = [];
let mockParams: Record<string, string | string[]> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useSegments: () => mockSegments,
  useLocalSearchParams: () => mockParams,
}));

import { useBack } from '@/hooks/useBack';
import { routes } from '@/lib/navigation';

describe('useBack', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockReplace.mockReset();
    mockCanGoBack = jest.fn(() => true);
    mockSegments = [];
    mockParams = {};
  });

  it('pops the stack when there is back history', () => {
    mockCanGoBack = jest.fn(() => true);
    const { result } = renderHook(() => useBack());
    result.current();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navigates to the route-derived Up target when there is no history', () => {
    mockCanGoBack = jest.fn(() => false);
    mockSegments = ['(stack)', 'my-games'];
    const { result } = renderHook(() => useBack());
    result.current();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(routes.profile());
  });

  it('resolves a dynamic Up target from params', () => {
    mockCanGoBack = jest.fn(() => false);
    mockSegments = ['(stack)', 'league', '[id]', 'invite'];
    mockParams = { id: '7' };
    const { result } = renderHook(() => useBack());
    result.current();
    expect(mockReplace).toHaveBeenCalledWith(routes.league(7));
  });

  it('falls back to Home when the route declares no parent', () => {
    // resolveUp dev-warns for unmapped (stack) routes (see navigation.test.ts)
    // — silence it here since this test intentionally exercises that gap.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockCanGoBack = jest.fn(() => false);
    mockSegments = ['(stack)', 'unmapped'];
    const { result } = renderHook(() => useBack());
    result.current();
    expect(mockReplace).toHaveBeenCalledWith(routes.home());
    warnSpy.mockRestore();
  });

  it('prefers an explicit override over the derived target', () => {
    mockCanGoBack = jest.fn(() => false);
    mockSegments = ['(stack)', 'my-games'];
    const { result } = renderHook(() => useBack(routes.leagues()));
    result.current();
    expect(mockReplace).toHaveBeenCalledWith(routes.leagues());
  });

  it('still pops when history exists even if an override is given', () => {
    mockCanGoBack = jest.fn(() => true);
    const { result } = renderHook(() => useBack(routes.leagues()));
    result.current();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
