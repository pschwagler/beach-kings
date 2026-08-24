import { maskRecoveryEmail } from '@/lib/contactPrivacy';

describe('email visibility contract', () => {
  it('masks an address for unauthenticated recovery', () => {
    expect(maskRecoveryEmail('tester@example.com')).toBe('te••••@example.com');
  });

  it('does not echo malformed recovery input', () => {
    expect(maskRecoveryEmail('not-an-email')).toBe('this email');
  });
});
