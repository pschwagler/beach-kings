import { describe, it, expect } from 'vitest';
import { isImageUrl, getPlayerImageUrl } from '../avatar';

describe('isImageUrl', () => {
  // ─── Falsy / empty inputs ───────────────────────────────────────────────────

  it('returns false for null', () => {
    expect(isImageUrl(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isImageUrl(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isImageUrl('')).toBe(false);
  });

  // ─── Valid image URLs ────────────────────────────────────────────────────────

  it('returns true for http:// URL', () => {
    expect(isImageUrl('http://example.com/img.png')).toBe(true);
  });

  it('returns true for https:// URL', () => {
    expect(isImageUrl('https://example.com/img.png')).toBe(true);
  });

  it('returns true for a root-relative path', () => {
    expect(isImageUrl('/uploads/avatar.jpg')).toBe(true);
  });

  // ─── Non-image / initials values ────────────────────────────────────────────

  it('returns false for initials string (e.g. "AB")', () => {
    expect(isImageUrl('AB')).toBe(false);
  });

  it('returns false for ftp:// URL', () => {
    expect(isImageUrl('ftp://example.com/file.png')).toBe(false);
  });

  it('returns false for data: URI', () => {
    expect(isImageUrl('data:image/png;base64,abc123')).toBe(false);
  });
});

describe('getPlayerImageUrl', () => {
  // ─── No image available ──────────────────────────────────────────────────────

  it('returns null when both fields are absent', () => {
    expect(getPlayerImageUrl({})).toBe(null);
  });

  it('returns null when both fields are null', () => {
    expect(getPlayerImageUrl({ avatar: null, profile_picture_url: null })).toBe(null);
  });

  it('returns null when avatar is initials and profile_picture_url is null', () => {
    expect(getPlayerImageUrl({ avatar: 'PS', profile_picture_url: null })).toBe(null);
  });

  it('returns null when both fields are initials strings', () => {
    expect(getPlayerImageUrl({ avatar: 'AB', profile_picture_url: 'CD' })).toBe(null);
  });

  // ─── profile_picture_url preferred over avatar ───────────────────────────────

  it('returns profile_picture_url when both are valid URLs', () => {
    expect(
      getPlayerImageUrl({
        avatar: 'https://example.com/avatar.jpg',
        profile_picture_url: 'https://example.com/profile.jpg',
      }),
    ).toBe('https://example.com/profile.jpg');
  });

  it('returns profile_picture_url when avatar is initials', () => {
    expect(
      getPlayerImageUrl({
        avatar: 'PS',
        profile_picture_url: 'https://example.com/profile.jpg',
      }),
    ).toBe('https://example.com/profile.jpg');
  });

  // ─── Fallback to avatar when profile_picture_url is absent ──────────────────

  it('returns avatar URL when profile_picture_url is null', () => {
    expect(
      getPlayerImageUrl({
        avatar: 'https://example.com/avatar.jpg',
        profile_picture_url: null,
      }),
    ).toBe('https://example.com/avatar.jpg');
  });

  it('returns avatar URL when profile_picture_url is undefined', () => {
    expect(
      getPlayerImageUrl({ avatar: 'https://example.com/avatar.jpg' }),
    ).toBe('https://example.com/avatar.jpg');
  });

  // ─── URL formats ─────────────────────────────────────────────────────────────

  it('returns http:// URLs', () => {
    expect(getPlayerImageUrl({ profile_picture_url: 'http://example.com/img.png' })).toBe(
      'http://example.com/img.png',
    );
  });

  it('returns root-relative paths', () => {
    expect(getPlayerImageUrl({ profile_picture_url: '/uploads/avatar.jpg' })).toBe(
      '/uploads/avatar.jpg',
    );
  });
});
