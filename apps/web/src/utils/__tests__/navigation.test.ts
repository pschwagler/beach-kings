import { describe, it, expect, vi } from 'vitest';
import { navigateToMatch, navigateToSession } from '../navigation';

function mockRouter() {
  return { push: vi.fn() } as unknown as Parameters<typeof navigateToMatch>[0];
}

describe('navigateToMatch', () => {
  it('navigates to league matches tab for league match', () => {
    const router = mockRouter();
    navigateToMatch(router, { league_id: 5, season_id: 12, session_code: 'ABC' });
    expect(router.push).toHaveBeenCalledWith('/league/5?tab=matches&season=12');
  });

  it('navigates to league matches tab without season when season_id is missing', () => {
    const router = mockRouter();
    navigateToMatch(router, { league_id: 5, session_code: 'ABC' });
    expect(router.push).toHaveBeenCalledWith('/league/5?tab=matches');
  });

  it('navigates to session page for pickup match', () => {
    const router = mockRouter();
    navigateToMatch(router, { session_code: 'XYZ' });
    expect(router.push).toHaveBeenCalledWith('/session/XYZ');
  });

  it('does nothing when both league_id and session_code are missing', () => {
    const router = mockRouter();
    navigateToMatch(router, {});
    expect(router.push).not.toHaveBeenCalled();
  });

  it('handles string league_id and season_id', () => {
    const router = mockRouter();
    navigateToMatch(router, { league_id: '3', season_id: '7' });
    expect(router.push).toHaveBeenCalledWith('/league/3?tab=matches&season=7');
  });

  it('ignores null/undefined league_id and falls through to session_code', () => {
    const router = mockRouter();
    navigateToMatch(router, { league_id: null, session_code: 'DEF' });
    expect(router.push).toHaveBeenCalledWith('/session/DEF');
  });
});

describe('navigateToSession', () => {
  it('navigates to league matches tab for league session', () => {
    const router = mockRouter();
    navigateToSession(router, { league_id: 8, season_id: 3, code: 'LG1' });
    expect(router.push).toHaveBeenCalledWith('/league/8?tab=matches&season=3');
  });

  it('navigates to league matches tab without season when season_id is missing', () => {
    const router = mockRouter();
    navigateToSession(router, { league_id: 8, code: 'LG1' });
    expect(router.push).toHaveBeenCalledWith('/league/8?tab=matches');
  });

  it('navigates to session page for pickup session', () => {
    const router = mockRouter();
    navigateToSession(router, { code: 'PK1' });
    expect(router.push).toHaveBeenCalledWith('/session/PK1');
  });

  it('does nothing when both league_id and code are missing', () => {
    const router = mockRouter();
    navigateToSession(router, {});
    expect(router.push).not.toHaveBeenCalled();
  });

  it('ignores null league_id and falls through to code', () => {
    const router = mockRouter();
    navigateToSession(router, { league_id: null, code: 'PK2' });
    expect(router.push).toHaveBeenCalledWith('/session/PK2');
  });
});
