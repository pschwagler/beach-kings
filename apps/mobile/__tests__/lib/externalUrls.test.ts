import { Alert, Linking } from 'react-native';

import {
  isExternalUrl,
  isHttpUrl,
  isPublicWebUrl,
  openHttpUrl,
  openPublicWebUrl,
  tryOpenExternalUrl,
} from '@/lib/externalUrls';
import { PUBLIC_WEB_ORIGIN } from '@/lib/publicUrls';

jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

describe('court external URLs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts only absolute HTTP(S) URLs with a host', () => {
    expect(isHttpUrl('https://parks.example.gov/courts')).toBe(true);
    expect(isHttpUrl('http://booking.example.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('sms:+15555550123')).toBe(false);
    expect(isHttpUrl('/relative')).toBe(false);
  });

  it('validates mail links without allowing them as web URLs', () => {
    const mailto = 'mailto:support@example.com?subject=Help';
    expect(isExternalUrl(mailto, ['mailto:'])).toBe(true);
    expect(isHttpUrl(mailto)).toBe(false);
  });

  it('opens a supported safe URL', async () => {
    await expect(openHttpUrl('https://parks.example.gov/courts')).resolves.toBe(
      true,
    );
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://parks.example.gov/courts',
    );
  });

  it('rejects unsafe URLs before asking the operating system to open them', async () => {
    await expect(openHttpUrl('javascript:alert(1)')).resolves.toBe(false);
    expect(Linking.canOpenURL).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Unable to open link',
      expect.any(String),
    );
  });

  it('returns false without presenting UI from the shared low-level launcher', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValueOnce(false);
    await expect(
      tryOpenExternalUrl('mailto:support@example.com', ['mailto:']),
    ).resolves.toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('uses the shared launcher for trusted public web pages', async () => {
    const termsUrl = `${PUBLIC_WEB_ORIGIN}/terms-of-service`;
    await expect(openPublicWebUrl(termsUrl)).resolves.toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith(termsUrl);
  });

  it('recognizes only credential-free URLs on the configured public origin', () => {
    expect(isPublicWebUrl(`${PUBLIC_WEB_ORIGIN}/privacy-policy`)).toBe(true);
    expect(isPublicWebUrl('https://example.com/privacy-policy')).toBe(false);

    const publicUrl = new URL(PUBLIC_WEB_ORIGIN);
    publicUrl.username = 'user';
    expect(isPublicWebUrl(publicUrl.toString())).toBe(false);
  });

  it('rejects HTTP(S) pages outside the configured public origin', async () => {
    await expect(
      openPublicWebUrl('https://example.com/terms-of-service'),
    ).resolves.toBe(false);
    expect(Linking.canOpenURL).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Unable to open link',
      expect.any(String),
    );
  });
});
