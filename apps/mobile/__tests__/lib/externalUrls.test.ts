import { Alert, Linking } from 'react-native';

import { isHttpUrl, openHttpUrl } from '@/lib/externalUrls';

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

  it('opens a supported safe URL', async () => {
    await expect(openHttpUrl('https://parks.example.gov/courts')).resolves.toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith('https://parks.example.gov/courts');
  });

  it('rejects unsafe URLs before asking the operating system to open them', async () => {
    await expect(openHttpUrl('javascript:alert(1)')).resolves.toBe(false);
    expect(Linking.canOpenURL).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Unable to open link', expect.any(String));
  });
});
