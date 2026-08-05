import { apiWebSocketUrl, resolveApiOrigin } from '@/config/apiOrigin';

describe('API origin resolution', () => {
  it('normalizes a secure production origin', () => {
    expect(
      resolveApiOrigin('  https://beachleaguevb.com/  ', false),
    ).toBe('https://beachleaguevb.com');
  });

  it('uses localhost only when development configuration is absent', () => {
    expect(resolveApiOrigin(undefined, true)).toBe('http://localhost:8000');
    expect(() => resolveApiOrigin(undefined, false)).toThrow(
      /required for production/,
    );
  });

  it.each([
    'not a URL',
    'ftp://beachleaguevb.com',
    'http://beachleaguevb.com',
    'https://beachleaguevb.com/api',
    'https://user:secret@beachleaguevb.com',
    'https://beachleaguevb.com?environment=production',
  ])('rejects invalid production-like configuration: %s', (value) => {
    expect(() => resolveApiOrigin(value, false)).toThrow();
  });

  it.each([
    'http://localhost:8000',
    'https://localhost:8000',
    'http://127.0.0.1:8000',
    'http://[::1]:8000',
  ])('rejects a loopback production origin: %s', (value) => {
    expect(() => resolveApiOrigin(value, false)).toThrow(/localhost/);
  });

  it('allows HTTP loopback during development but not a remote HTTP host', () => {
    expect(resolveApiOrigin('http://127.0.0.1:8000', true)).toBe(
      'http://127.0.0.1:8000',
    );
    expect(() =>
      resolveApiOrigin('http://dev.beachleaguevb.com', true),
    ).toThrow(/HTTPS/);
  });

  it('derives the notification WebSocket URL from the same origin', () => {
    expect(apiWebSocketUrl('/api/ws/notifications')).toBe(
      'ws://localhost:8000/api/ws/notifications',
    );
  });
});
