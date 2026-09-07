import { getAppleAuthError } from '@/lib/appleAuthError';

describe('Apple auth recovery', () => {
  it.each([
    ['APPLE_AUTH_CONFLICT', 'original method'],
    ['APPLE_AUTH_ELIGIBILITY', 'age check'],
    ['APPLE_AUTH_CONFIG', 'another sign-in method'],
    ['APPLE_AUTH_PROVIDER', 'in a moment'],
    ['APPLE_AUTH_RETRY', 'start Apple sign-in again'],
  ])('maps %s safely', (code, text) => {
    const result = getAppleAuthError({ response: { data: { detail: { code, message: 'PRIVATE' } } } });
    expect(result.message).toContain(text);
    expect(result.message).not.toContain('PRIVATE');
    expect(result.needsSignup).toBe(code === 'APPLE_AUTH_ELIGIBILITY');
  });
  it('distinguishes network failure and ignores raw native errors', () => {
    expect(getAppleAuthError({ code: 'ERR_NETWORK' }).message).toContain('connection');
    expect(getAppleAuthError(new Error('PRIVATE')).message).not.toContain('PRIVATE');
  });
});
