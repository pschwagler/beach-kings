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
    'http://192.168.1.20:8000',
    'https://beachleaguevb.com/api',
    'https://user:secret@beachleaguevb.com',
    'https://beachleaguevb.com?environment=production',
    'https://beachleaguevb.com#environment',
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

  it.each([
    ['http://127.0.0.1:8000', 'http://127.0.0.1:8000'],
    ['http://10.0.0.1:8000', 'http://10.0.0.1:8000'],
    ['http://10.255.255.255:8000', 'http://10.255.255.255:8000'],
    ['http://172.16.0.1:8000', 'http://172.16.0.1:8000'],
    ['http://172.31.255.255:8000', 'http://172.31.255.255:8000'],
    ['http://192.168.0.1:8000', 'http://192.168.0.1:8000'],
    ['http://192.168.255.255:8000/', 'http://192.168.255.255:8000'],
  ])('allows development HTTP for loopback or RFC1918 IPv4: %s', (value, expected) => {
    expect(resolveApiOrigin(value, true)).toBe(expected);
  });

  it.each([
    'http://dev.beachleaguevb.com',
    'http://8.8.8.8:8000',
    'http://172.15.255.255:8000',
    'http://172.32.0.0:8000',
    'http://192.167.255.255:8000',
    'http://192.169.0.0:8000',
    'http://169.254.1.1:8000',
    'http://3232235777:8000',
    'http://0xc0a80101:8000',
    'http://0300.0250.0001.0001:8000',
  ])('rejects non-private development HTTP: %s', (value) => {
    expect(() => resolveApiOrigin(value, true)).toThrow(/HTTPS/);
  });

  it.each([
    'http://192.168.1.20:8000/api',
    'http://user:secret@192.168.1.20:8000',
    'http://192.168.1.20:8000?environment=development',
    'http://192.168.1.20:8000#environment',
  ])('does not relax origin-shape validation in development: %s', (value) => {
    expect(() => resolveApiOrigin(value, true)).toThrow();
  });

  it('derives the notification WebSocket URL from the same origin', () => {
    expect(apiWebSocketUrl('/api/ws/notifications')).toBe(
      'ws://localhost:8000/api/ws/notifications',
    );
  });
});
