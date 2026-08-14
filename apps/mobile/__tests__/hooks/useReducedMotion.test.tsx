import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';

function Probe(): React.ReactNode {
  const reduced = useReducedMotion();
  return <Text testID="value">{reduced ? 'reduced' : 'normal'}</Text>;
}

describe('useReducedMotion', () => {
  let listener: ((enabled: boolean) => void) | undefined;
  const remove = jest.fn();

  beforeEach(() => {
    listener = undefined;
    remove.mockClear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(
      ((event: string, nextListener: (enabled: boolean) => void) => {
        if (event === 'reduceMotionChanged') listener = nextListener;
        return { remove };
      }) as unknown as typeof AccessibilityInfo.addEventListener,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the current operating-system preference', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
    const { getByTestId } = render(<Probe />);

    await waitFor(() => expect(getByTestId('value')).toHaveTextContent('reduced'));
  });

  it('updates when the native preference changes and removes its listener', async () => {
    const { getByTestId, unmount } = render(<Probe />);
    await waitFor(() => expect(listener).toBeDefined());

    act(() => listener?.(true));
    expect(getByTestId('value')).toHaveTextContent('reduced');

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('keeps the safe default when the preference query fails', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockRejectedValue(
      new Error('unavailable'),
    );
    const { getByTestId } = render(<Probe />);

    await waitFor(() => expect(getByTestId('value')).toHaveTextContent('normal'));
  });
});
