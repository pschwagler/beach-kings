/**
 * Tests for the native share sheet helper in @/utils/share.
 *
 * React Native's Share API is mocked so tests run without a native bridge.
 */
import { Share } from 'react-native';
import { shareLink } from '@/utils/share';

jest.mock('react-native', () => ({
  Share: {
    share: jest.fn(),
  },
}));

const mockShare = Share.share as jest.MockedFunction<typeof Share.share>;

beforeEach(() => {
  jest.clearAllMocks();
  mockShare.mockResolvedValue({ action: 'sharedAction' } as any);
});

// ---------------------------------------------------------------------------
// shareLink — happy path
// ---------------------------------------------------------------------------
describe('shareLink', () => {
  it('calls Share.share with url and message set to the url', async () => {
    await shareLink('https://example.com/league/1');

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/league/1',
        message: 'https://example.com/league/1',
      }),
      expect.anything(),
    );
  });

  it('passes title when provided', async () => {
    await shareLink('https://example.com', 'Beach League');

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Beach League' }),
      expect.objectContaining({ dialogTitle: 'Beach League' }),
    );
  });

  it('passes undefined title when title is omitted', async () => {
    await shareLink('https://example.com');

    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ title: undefined }),
      expect.objectContaining({ dialogTitle: undefined }),
    );
  });

  it('resolves without throwing when share succeeds', async () => {
    await expect(shareLink('https://example.com')).resolves.toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // shareLink — user dismissal cases
  // ---------------------------------------------------------------------------
  it('silently resolves when Share.share rejects with "Share was cancelled"', async () => {
    mockShare.mockRejectedValueOnce(new Error('Share was cancelled'));
    await expect(shareLink('https://example.com')).resolves.toBeUndefined();
  });

  it('silently resolves when error message contains "dismissed"', async () => {
    mockShare.mockRejectedValueOnce(new Error('User dismissed the dialog'));
    await expect(shareLink('https://example.com')).resolves.toBeUndefined();
  });

  it('silently resolves when error message contains only "dismissed" (case variation)', async () => {
    mockShare.mockRejectedValueOnce(new Error('sheet dismissed by user'));
    await expect(shareLink('https://example.com')).resolves.toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // shareLink — unexpected errors propagate
  // ---------------------------------------------------------------------------
  it('re-throws unexpected Error instances', async () => {
    const unexpectedError = new Error('Network failure');
    mockShare.mockRejectedValueOnce(unexpectedError);
    await expect(shareLink('https://example.com')).rejects.toThrow('Network failure');
  });

  it('re-throws non-Error unexpected values', async () => {
    mockShare.mockRejectedValueOnce('some string error');
    await expect(shareLink('https://example.com')).rejects.toBe('some string error');
  });
});
