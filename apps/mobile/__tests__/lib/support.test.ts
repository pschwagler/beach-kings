/**
 * Tests for support.ts mailto helpers.
 */

import { Alert, Linking } from 'react-native';
import {
  openSupportMailto,
  SUPPORT_EMAIL,
  supportMailtoPhoneChange,
  supportMailtoGeneral,
} from '@/lib/support';

const mockCanOpenURL = jest.spyOn(Linking, 'canOpenURL');
const mockOpenURL = jest.spyOn(Linking, 'openURL');
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  mockCanOpenURL.mockResolvedValue(true);
  mockOpenURL.mockResolvedValue(true);
});

describe('support.ts', () => {
  it('SUPPORT_EMAIL is the correct beach league support address', () => {
    expect(SUPPORT_EMAIL).toBe('beachleaguevb+support@gmail.com');
  });

  describe('supportMailtoPhoneChange()', () => {
    it('returns a mailto URL with the correct recipient', () => {
      const url = supportMailtoPhoneChange();
      expect(url).toMatch(/^mailto:beachleaguevb\+support@gmail\.com/);
    });

    it('includes the phone-change subject', () => {
      const url = supportMailtoPhoneChange();
      expect(url).toContain('Change%20phone%20number');
    });
  });

  describe('supportMailtoGeneral()', () => {
    it('returns a mailto URL with the correct recipient', () => {
      const url = supportMailtoGeneral();
      expect(url).toMatch(/^mailto:beachleaguevb\+support@gmail\.com/);
    });

    it('includes a general support subject', () => {
      const url = supportMailtoGeneral();
      expect(url).toContain('Beach%20League%20Support');
    });
  });

  describe('openSupportMailto()', () => {
    it('opens a supported mailto URL', async () => {
      const url = supportMailtoGeneral();

      await expect(openSupportMailto(url)).resolves.toBe(true);

      expect(mockCanOpenURL).toHaveBeenCalledWith(url);
      expect(mockOpenURL).toHaveBeenCalledWith(url);
      expect(mockAlert).not.toHaveBeenCalled();
    });

    it('shows the support address when no email app supports mailto links', async () => {
      mockCanOpenURL.mockResolvedValue(false);

      await expect(openSupportMailto(supportMailtoGeneral())).resolves.toBe(false);

      expect(mockOpenURL).not.toHaveBeenCalled();
      expect(mockAlert).toHaveBeenCalledWith(
        'Email app unavailable',
        expect.stringContaining(SUPPORT_EMAIL),
      );
    });

    it('shows the support address when opening the email app fails', async () => {
      mockOpenURL.mockRejectedValue(new Error('No email account configured'));

      await expect(openSupportMailto(supportMailtoGeneral())).resolves.toBe(false);

      expect(mockAlert).toHaveBeenCalledWith(
        'Email app unavailable',
        expect.stringContaining(SUPPORT_EMAIL),
      );
    });
  });
});
