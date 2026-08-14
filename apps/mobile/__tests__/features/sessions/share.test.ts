const mockShareLink = jest.fn();

jest.mock('@/utils/share', () => ({
  shareLink: (...args: unknown[]) => mockShareLink(...args),
}));

import {
  buildSessionInvitation,
  SessionInvitationUnavailableError,
  shareSessionInvitation,
} from '@/features/sessions/share';
import { PUBLIC_WEB_ORIGIN } from '@/lib/publicUrls';

describe('session sharing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShareLink.mockResolvedValue(undefined);
  });

  it('normalizes the code and builds an invitation for this deployment', () => {
    expect(buildSessionInvitation(' bkshare1 ')).toEqual({
      code: 'BKSHARE1',
      url: `${PUBLIC_WEB_ORIGIN}/session/BKSHARE1`,
      message:
        `Join my Beach League session with code BKSHARE1: ${PUBLIC_WEB_ORIGIN}/session/BKSHARE1`,
    });
  });

  it('opens the native share sheet with the invitation', async () => {
    await shareSessionInvitation('bkshare1');

    expect(mockShareLink).toHaveBeenCalledWith(
      `${PUBLIC_WEB_ORIGIN}/session/BKSHARE1`,
      'Share Session',
      `Join my Beach League session with code BKSHARE1: ${PUBLIC_WEB_ORIGIN}/session/BKSHARE1`,
    );
  });

  it('rejects missing and blank codes before opening the share sheet', async () => {
    await expect(shareSessionInvitation(null)).rejects.toBeInstanceOf(
      SessionInvitationUnavailableError,
    );
    await expect(shareSessionInvitation('  ')).rejects.toBeInstanceOf(
      SessionInvitationUnavailableError,
    );
    expect(mockShareLink).not.toHaveBeenCalled();
  });
});
