import { describe, it, expect } from 'vitest';
import { isImageUrl } from '../avatar';

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
