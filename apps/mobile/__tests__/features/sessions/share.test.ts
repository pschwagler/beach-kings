const mockShareLink = jest.fn();

jest.mock('@/utils/share', () => ({
  shareLink: (...args: unknown[]) => mockShareLink(...args),
}));

import {
  buildSessionInvitation,
  SessionInvitationUnavailableError,
  shareSessionInvitation,
} from '@/features/sessions/share';

describe('session sharing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShareLink.mockResolvedValue(undefined);
  });

  it('normalizes the code and builds a stable production invitation', () => {
    expect(buildSessionInvitation(' bkshare1 ')).toEqual({
      code: 'BKSHARE1',
      url: 'https://beachleaguevb.com/session/BKSHARE1',
      message:
        'Join my Beach League session with code BKSHARE1: https://beachleaguevb.com/session/BKSHARE1',
    });
  });

  it('opens the native share sheet with the invitation', async () => {
    await shareSessionInvitation('bkshare1');

    expect(mockShareLink).toHaveBeenCalledWith(
      'https://beachleaguevb.com/session/BKSHARE1',
      'Share Session',
      'Join my Beach League session with code BKSHARE1: https://beachleaguevb.com/session/BKSHARE1',
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
