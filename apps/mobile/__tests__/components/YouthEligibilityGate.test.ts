import {
  bandFromApple,
  declarationFromApple,
} from '@/components/auth/YouthEligibilityGate';

jest.mock('expo-declared-age-range', () => ({
  requestDeclaredAgeRange: jest.fn(),
}));

describe('YouthEligibilityGate age-range mapping', () => {
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
});
