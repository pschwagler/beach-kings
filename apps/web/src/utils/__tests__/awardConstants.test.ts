import { describe, it, expect } from 'vitest';
import { AWARD_CONFIG, formatAwardValue } from '../awardConstants';

// ─── AWARD_CONFIG ────────────────────────────────────────────────────────────

describe('AWARD_CONFIG', () => {
  it('has exactly 7 keys', () => {
    expect(Object.keys(AWARD_CONFIG)).toHaveLength(7);
  });

  it('every entry has a string label', () => {
    for (const key of Object.keys(AWARD_CONFIG)) {
      expect(typeof AWARD_CONFIG[key].label).toBe('string');
    }
  });

  it('every entry has a string iconName', () => {
    for (const key of Object.keys(AWARD_CONFIG)) {
      expect(typeof AWARD_CONFIG[key].iconName).toBe('string');
    }
  });

  it('every entry has a string colorClass', () => {
    for (const key of Object.keys(AWARD_CONFIG)) {
      expect(typeof AWARD_CONFIG[key].colorClass).toBe('string');
    }
  });

  it('stat awards have a subtitle', () => {
    const statAwards = ['ironman', 'sharpshooter', 'point_machine', 'rising_star'];
    for (const key of statAwards) {
      expect(typeof AWARD_CONFIG[key].subtitle).toBe('string');
    }
  });

  it('placement awards (gold, silver, bronze) do not have a subtitle', () => {
    const placementAwards = ['gold', 'silver', 'bronze'];
    for (const key of placementAwards) {
      expect(AWARD_CONFIG[key].subtitle).toBeUndefined();
    }
  });
});

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
