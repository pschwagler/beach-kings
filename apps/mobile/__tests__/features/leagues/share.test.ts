const mockShareLink = jest.fn();

jest.mock('@/utils/share', () => ({
  shareLink: (...args: unknown[]) => mockShareLink(...args),
}));

import {
  buildLeagueInvitationShare,
  shareLeagueInvitation,
} from '@/features/leagues/share';
import { PUBLIC_WEB_ORIGIN } from '@/lib/publicUrls';

describe('league invitation sharing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShareLink.mockResolvedValue(undefined);
  });

  it('builds the production league URL and exact invitation copy', () => {
    expect(buildLeagueInvitationShare('42', '  Queens Open  ')).toEqual({
      url: `${PUBLIC_WEB_ORIGIN}/league/42`,
      title: 'Share Queens Open',
      message: `Join Queens Open on Beach League: ${PUBLIC_WEB_ORIGIN}/league/42`,
    });
  });

  it.each([
    [0, 'Queens Open'],
    [-1, 'Queens Open'],
    ['missing', 'Queens Open'],
    [42, '   '],
  ])('rejects incomplete league details', (leagueId, leagueName) => {
    expect(() => buildLeagueInvitationShare(leagueId, leagueName)).toThrow(
      'League details are unavailable',
    );
  });

  it('opens the native share helper with the built invitation', async () => {
    await shareLeagueInvitation(42, 'Queens Open');

    expect(mockShareLink).toHaveBeenCalledWith(
      `${PUBLIC_WEB_ORIGIN}/league/42`,
      'Share Queens Open',
      `Join Queens Open on Beach League: ${PUBLIC_WEB_ORIGIN}/league/42`,
    );
  });
});
