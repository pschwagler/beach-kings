import { describe, expect, it } from 'vitest';
import { validatePassword } from '../passwordPolicy';

describe('password policy contract', () => {
  it('accepts eight characters without requiring a number', () => {
    expect(validatePassword('abcdefgh')).toEqual({ minLength: true });
  });

  it('rejects fewer than eight characters', () => {
    expect(validatePassword('abcdefg')).toEqual({ minLength: false });
  });
});
