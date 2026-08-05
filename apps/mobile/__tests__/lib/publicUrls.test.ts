import { PUBLIC_URLS, PUBLIC_WEB_ORIGIN } from '@/lib/publicUrls';

describe('public URLs', () => {
  it('keeps every public destination on the canonical HTTPS origin', () => {
    expect(PUBLIC_WEB_ORIGIN).toBe('https://beachleaguevb.com');
    expect(PUBLIC_URLS).toEqual({
      terms: 'https://beachleaguevb.com/terms-of-service',
      privacy: 'https://beachleaguevb.com/privacy-policy',
      support: 'https://beachleaguevb.com/support',
    });
    expect(Object.values(PUBLIC_URLS).every((url) => url.startsWith(`${PUBLIC_WEB_ORIGIN}/`)))
      .toBe(true);
  });
});
