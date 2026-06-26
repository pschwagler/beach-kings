/**
 * Tests for support.ts mailto helpers.
 */

import {
  SUPPORT_EMAIL,
  supportMailtoPhoneChange,
  supportMailtoGeneral,
} from '@/lib/support';

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
});
