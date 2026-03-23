import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockOpenModal = vi.fn();

vi.mock('../../contexts/ModalContext', () => ({
  useModal: vi.fn(() => ({ openModal: mockOpenModal })),
  MODAL_TYPES: { SHARE_FALLBACK: 'SHARE_FALLBACK' },
}));

import useShare, { SHARE_TITLE, getShareText } from '../useShare';

describe('getShareText', () => {
  it('returns the correct share text format', () => {
    expect(getShareText('Alice')).toBe('Alice — claim your matches on Beach League');
  });

  it('handles names with special characters', () => {
    expect(getShareText('O\'Brien')).toBe("O'Brien — claim your matches on Beach League");
  });
});

describe('SHARE_TITLE', () => {
  it('is "Beach League Invite"', () => {
    expect(SHARE_TITLE).toBe('Beach League Invite');
  });
});

describe('useShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('desktop (maxTouchPoints = 0)', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', { maxTouchPoints: 0 });
    });

    it('opens the SHARE_FALLBACK modal with correct props on desktop', async () => {
      const { result } = renderHook(() => useShare());

      await act(async () => {
        await result.current.shareInvite({ name: 'Bob', url: 'https://example.com/invite/bob' });
      });

      expect(mockOpenModal).toHaveBeenCalledTimes(1);
      expect(mockOpenModal).toHaveBeenCalledWith('SHARE_FALLBACK', {
        name: 'Bob',
        url: 'https://example.com/invite/bob',
        text: getShareText('Bob'),
      });
    });

    it('does not call navigator.share on desktop even if it exists', async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { maxTouchPoints: 0, share: mockShare });

      const { result } = renderHook(() => useShare());

      await act(async () => {
        await result.current.shareInvite({ name: 'Carol', url: 'https://example.com/carol' });
      });

      expect(mockShare).not.toHaveBeenCalled();
      expect(mockOpenModal).toHaveBeenCalledTimes(1);
    });
  });

  describe('mobile with navigator.share available', () => {
    it('calls navigator.share and does not open the modal on success', async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { maxTouchPoints: 1, share: mockShare });

      const { result } = renderHook(() => useShare());

      await act(async () => {
        await result.current.shareInvite({ name: 'Dave', url: 'https://example.com/dave' });
      });

      expect(mockShare).toHaveBeenCalledTimes(1);
      expect(mockShare).toHaveBeenCalledWith({
        title: SHARE_TITLE,
        text: getShareText('Dave'),
        url: 'https://example.com/dave',
      });
      expect(mockOpenModal).not.toHaveBeenCalled();
    });

    it('returns without opening modal when navigator.share throws AbortError', async () => {
      const abortError = new Error('User cancelled');
      abortError.name = 'AbortError';
      const mockShare = vi.fn().mockRejectedValue(abortError);
      vi.stubGlobal('navigator', { maxTouchPoints: 1, share: mockShare });

      const { result } = renderHook(() => useShare());

      await act(async () => {
        await result.current.shareInvite({ name: 'Eve', url: 'https://example.com/eve' });
      });

      expect(mockShare).toHaveBeenCalledTimes(1);
      expect(mockOpenModal).not.toHaveBeenCalled();
    });

    it('opens the modal as fallback when navigator.share throws a non-AbortError', async () => {
      const otherError = new Error('Share expired');
      otherError.name = 'NotAllowedError';
      const mockShare = vi.fn().mockRejectedValue(otherError);
      vi.stubGlobal('navigator', { maxTouchPoints: 1, share: mockShare });

      const { result } = renderHook(() => useShare());

      await act(async () => {
        await result.current.shareInvite({ name: 'Frank', url: 'https://example.com/frank' });
      });

      expect(mockShare).toHaveBeenCalledTimes(1);
      expect(mockOpenModal).toHaveBeenCalledTimes(1);
      expect(mockOpenModal).toHaveBeenCalledWith('SHARE_FALLBACK', {
        name: 'Frank',
        url: 'https://example.com/frank',
        text: getShareText('Frank'),
      });
    });

    it('opens the modal when on mobile but navigator.share is undefined', async () => {
      vi.stubGlobal('navigator', { maxTouchPoints: 1 });

      const { result } = renderHook(() => useShare());

      await act(async () => {
        await result.current.shareInvite({ name: 'Grace', url: 'https://example.com/grace' });
      });

      expect(mockOpenModal).toHaveBeenCalledTimes(1);
      expect(mockOpenModal).toHaveBeenCalledWith('SHARE_FALLBACK', {
        name: 'Grace',
        url: 'https://example.com/grace',
        text: getShareText('Grace'),
      });
    });
  });
});
