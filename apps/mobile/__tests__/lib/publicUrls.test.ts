import { resolvePublicWebOrigin } from '@/config/publicWebOrigin';
import { PUBLIC_URLS, PUBLIC_WEB_ORIGIN } from '@/lib/publicUrls';

describe('public URLs', () => {
  it('uses an explicit web origin independently of the API origin', () => {
    expect(
      resolvePublicWebOrigin(
        'https://app.example.com',
        'https://api.example.com:8000',
        false,
      ),
    ).toBe('https://app.example.com');
  });

  it('maps the conventional local API port only as a development fallback', () => {
    expect(
      resolvePublicWebOrigin(undefined, 'http://localhost:8000', true),
    ).toBe('http://localhost:3000');
    expect(
      resolvePublicWebOrigin(undefined, 'http://192.168.1.20:8000', true),
    ).toBe('http://192.168.1.20:3000');
    expect(
      resolvePublicWebOrigin(
        undefined,
        'https://api.example.com:8000',
        true,
      ),
    ).toBe('https://api.example.com:8000');
  });

  it('requires explicit configuration outside development', () => {
    expect(() =>
      resolvePublicWebOrigin(undefined, 'https://api.example.com:8000', false),
    ).toThrow(/EXPO_PUBLIC_WEB_URL is required/);
  });

  it.each([
    'not a URL',
    'http://beachleaguevb.com',
    'https://beachleaguevb.com/support',
    'https://user:secret@beachleaguevb.com',
  ])('rejects invalid production web configuration: %s', (value) => {
    expect(() =>
      resolvePublicWebOrigin(value, 'https://api.example.com', false),
    ).toThrow();
  });

  it('builds every remaining web destination from the resolved origin', () => {
    expect(PUBLIC_URLS).toEqual({
      terms: `${PUBLIC_WEB_ORIGIN}/terms-of-service`,
      privacy: `${PUBLIC_WEB_ORIGIN}/privacy-policy`,
      communityGuidelines: `${PUBLIC_WEB_ORIGIN}/community-guidelines`,
    });
    expect(
      Object.values(PUBLIC_URLS).every((url) =>
        url.startsWith(`${PUBLIC_WEB_ORIGIN}/`),
      ),
    ).toBe(true);
  });
});
