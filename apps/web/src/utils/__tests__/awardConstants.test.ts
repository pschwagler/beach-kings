import { describe, it, expect } from 'vitest';
import { formatAwardValue } from '../awardConstants';

// ─── formatAwardValue ─────────────────────────────────────────────────────────

describe('formatAwardValue', () => {
  // ─── Null / undefined value ─────────────────────────────────────────────────

  it('returns empty string for null value', () => {
    expect(formatAwardValue('gold', null)).toBe('');
  });

  it('returns empty string for undefined value', () => {
    expect(formatAwardValue('gold', undefined)).toBe('');
  });

  // ─── Placement awards ───────────────────────────────────────────────────────

  it('formats gold with rounded points', () => {
    expect(formatAwardValue('gold', 150.4)).toBe('150 pts');
  });

  it('formats bronze with zero points', () => {
    expect(formatAwardValue('bronze', 0)).toBe('0 pts');
  });

  it('formats silver like gold/bronze', () => {
    expect(formatAwardValue('silver', 99.9)).toBe('100 pts');
  });

  // ─── Sharpshooter ───────────────────────────────────────────────────────────

  it('formats sharpshooter as integer percentage', () => {
    expect(formatAwardValue('sharpshooter', 0.756)).toBe('76%');
  });

  it('formats sharpshooter 1.0 as 100%', () => {
    expect(formatAwardValue('sharpshooter', 1.0)).toBe('100%');
  });

  it('formats sharpshooter 0 as 0%', () => {
    expect(formatAwardValue('sharpshooter', 0)).toBe('0%');
  });

  // ─── Point machine ──────────────────────────────────────────────────────────

  it('formats positive point_machine with leading +', () => {
    expect(formatAwardValue('point_machine', 1.55)).toBe('+1.6');
  });

  it('formats negative point_machine without leading +', () => {
    expect(formatAwardValue('point_machine', -2.5)).toBe('-2.5');
  });

  it('formats zero point_machine as +0.0', () => {
    expect(formatAwardValue('point_machine', 0)).toBe('+0.0');
  });

  // ─── Rising star ────────────────────────────────────────────────────────────

  it('formats positive rising_star with leading + and ELO suffix', () => {
    expect(formatAwardValue('rising_star', 50)).toBe('+50 ELO');
  });

  it('formats negative rising_star without leading + and ELO suffix', () => {
    expect(formatAwardValue('rising_star', -10)).toBe('-10 ELO');
  });

  it('formats zero rising_star as +0 ELO', () => {
    expect(formatAwardValue('rising_star', 0)).toBe('+0 ELO');
  });

  // ─── Ironman ─────────────────────────────────────────────────────────────────

  it('formats ironman with games suffix', () => {
    expect(formatAwardValue('ironman', 25)).toBe('25 games');
  });

  it('formats ironman zero as 0 games', () => {
    expect(formatAwardValue('ironman', 0)).toBe('0 games');
  });

  // ─── Unknown key ─────────────────────────────────────────────────────────────

  it('falls back to String() for unknown award key', () => {
    expect(formatAwardValue('unknown', 42)).toBe('42');
  });
});
