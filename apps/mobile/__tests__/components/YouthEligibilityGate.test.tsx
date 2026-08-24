import React, { StrictMode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import YouthEligibilityGate, {
  APPLE_FALLBACK_DELAY_MS,
  bandFromApple,
  declarationFromApple,
  withDeadline,
} from '@/components/auth/YouthEligibilityGate';
import { api } from '@/lib/api';
import { requestDeclaredAgeRange } from 'expo-declared-age-range';

jest.mock('expo-declared-age-range', () => ({
  requestDeclaredAgeRange: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  api: { checkYouthEligibility: jest.fn() },
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ brandTeal: '#008080' }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

describe('YouthEligibilityGate age-range mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [undefined, 'under_minimum'],
    [13, 'junior'],
    [14, 'junior'],
    [17, 'junior'],
    [18, 'adult'],
  ] as const)('maps Apple lower bound %s to %s', (lowerBound, expected) => {
    expect(bandFromApple(lowerBound)).toBe(expected);
  });

  it.each([
    ['selfDeclared', 'self_declared'],
    ['guardianDeclared', 'guardian_declared'],
    ['paymentChecked', 'verified'],
    ['guardianGovernmentIDChecked', 'guardian_verified'],
  ] as const)('minimizes Apple declaration %s to %s', (value, expected) => {
    expect(declarationFromApple(value)).toBe(expected);
  });

  it('bounds a stalled eligibility request', async () => {
    jest.useFakeTimers();
    const result = withDeadline(new Promise<string>(() => {}), 15_000);
    jest.advanceTimersByTime(15_000);
    await expect(result).rejects.toThrow('ELIGIBILITY_TIMEOUT');
    jest.useRealTimers();
  });

  it('returns a completed eligibility request before its deadline', async () => {
    await expect(withDeadline(Promise.resolve('eligible'), 15_000))
      .resolves.toBe('eligible');
  });

  it('keeps one Apple request alive through StrictMode replay and exposes delayed fallback', async () => {
    jest.useFakeTimers();
    let resolveApple!: (value: { status: 'unavailable' }) => void;
    (requestDeclaredAgeRange as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolveApple = resolve; }),
    );

    const result = render(
      <StrictMode>
        <YouthEligibilityGate onEligible={jest.fn()} />
      </StrictMode>,
    );

    expect(requestDeclaredAgeRange).toHaveBeenCalledTimes(1);
    expect(result.getByTestId('eligibility-stage')).toHaveTextContent(
      'Waiting for Apple age range',
    );

    act(() => { jest.advanceTimersByTime(APPLE_FALLBACK_DELAY_MS); });
    expect(result.getByTestId('eligibility-stage')).toHaveTextContent(
      'Choose your age range',
    );

    await act(async () => { resolveApple({ status: 'unavailable' }); });
    jest.useRealTimers();
  });

  it('ignores an Apple completion after unmount', async () => {
    let resolveApple!: (value: {
      status: 'shared';
      lowerBound: number;
      declaration: string;
    }) => void;
    (requestDeclaredAgeRange as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolveApple = resolve; }),
    );
    const result = render(<YouthEligibilityGate onEligible={jest.fn()} />);

    result.unmount();
    await act(async () => {
      resolveApple({ status: 'shared', lowerBound: 18, declaration: 'selfDeclared' });
    });

    expect(api.checkYouthEligibility).not.toHaveBeenCalled();
  });

  it('lets a delayed manual choice cancel Apple and prevents duplicate server checks', async () => {
    jest.useFakeTimers();
    let resolveApple!: (value: {
      status: 'shared';
      lowerBound: number;
      declaration: string;
    }) => void;
    (requestDeclaredAgeRange as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolveApple = resolve; }),
    );
    (api.checkYouthEligibility as jest.Mock).mockReturnValueOnce(
      new Promise(() => {}),
    );
    const result = render(<YouthEligibilityGate onEligible={jest.fn()} />);

    act(() => { jest.advanceTimersByTime(APPLE_FALLBACK_DELAY_MS); });
    fireEvent.press(result.getByTestId('age-band'));
    fireEvent.press(result.getByText('18 or older'));
    const continueButton = result.getByLabelText('Continue');
    fireEvent.press(continueButton);
    fireEvent.press(continueButton);

    expect(api.checkYouthEligibility).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveApple({ status: 'shared', lowerBound: 18, declaration: 'selfDeclared' });
    });
    expect(api.checkYouthEligibility).toHaveBeenCalledTimes(1);
    result.unmount();
    jest.useRealTimers();
  });

  it('ignores a server completion after unmount', async () => {
    let resolveServer!: (value: { eligibility_token: string }) => void;
    (requestDeclaredAgeRange as jest.Mock).mockResolvedValueOnce({
      status: 'shared',
      lowerBound: 18,
      declaration: 'selfDeclared',
    });
    (api.checkYouthEligibility as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolveServer = resolve; }),
    );
    const onEligible = jest.fn();
    const result = render(<YouthEligibilityGate onEligible={onEligible} />);

    await waitFor(() => expect(api.checkYouthEligibility).toHaveBeenCalledTimes(1));
    result.unmount();
    await act(async () => { resolveServer({ eligibility_token: 'late-token' }); });

    expect(onEligible).not.toHaveBeenCalled();
  });
});
