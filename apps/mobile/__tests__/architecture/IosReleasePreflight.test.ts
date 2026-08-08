import fs from 'node:fs';
import path from 'node:path';

const {
  assertSecureProductionOrigin,
  verifyNoTrackingDependencies,
  verifyPrivacyManifest,
  verifyReleaseConfiguration,
} = require('../../scripts/release-preflight') as {
  assertSecureProductionOrigin: (value: string | undefined) => string;
  verifyNoTrackingDependencies: (packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }) => void;
  verifyPrivacyManifest: (source: string) => {
    collectedDataTypeCount: number;
    requiredReasonCategoryCount: number;
    tracking: false;
  };
  verifyReleaseConfiguration: (options: {
    mobileRoot: string;
    apiUrl: string | undefined;
    exportDirectory: string;
  }) => {
    apiOrigin: string;
    bundleIdentifier: string;
    deviceFamily: string;
    privacyCollectedDataTypeCount: number;
    version: string;
  };
};

const mobileRoot = path.resolve(__dirname, '../..');

describe('iOS release preflight', () => {
  it('accepts the checked-in native release configuration', () => {
    expect(
      verifyReleaseConfiguration({
        mobileRoot,
        apiUrl: 'https://beachleaguevb.com',
        exportDirectory: path.join(mobileRoot, 'dist'),
      }),
    ).toEqual(
      expect.objectContaining({
        apiOrigin: 'https://beachleaguevb.com',
        bundleIdentifier: 'com.beachleague.app',
        deviceFamily: 'iPhone',
        privacyCollectedDataTypeCount: 13,
        version: '1.0.0 (1)',
      }),
    );
  });

  it.each([undefined, '', 'not-a-url', 'http://beachleaguevb.com']) (
    'rejects a missing, malformed, or insecure release origin: %s',
    (value) => expect(() => assertSecureProductionOrigin(value)).toThrow(),
  );

  it.each([
    'http://localhost:8000',
    'https://localhost:8000',
    'https://127.0.0.1:8000',
  ])('rejects a localhost release origin: %s', (value) => {
    expect(() => assertSecureProductionOrigin(value)).toThrow(/localhost/);
  });

  describe('privacy manifest', () => {
    const manifestPath = path.join(
      mobileRoot,
      'ios/BeachLeague/PrivacyInfo.xcprivacy',
    );
    const readManifest = () => fs.readFileSync(manifestPath, 'utf8');

    it('accepts the approved collected-data and required-reason declarations', () => {
      expect(verifyPrivacyManifest(readManifest())).toEqual({
        collectedDataTypeCount: 13,
        requiredReasonCategoryCount: 4,
        tracking: false,
      });
    });

    it('rejects a malformed or empty manifest', () => {
      expect(() => verifyPrivacyManifest('<plist><dict/></plist>')).toThrow(
        /collected data types/,
      );
    });

    it('rejects tracking being enabled for a collected data type', () => {
      const changed = readManifest().replace(
        '<key>NSPrivacyCollectedDataTypeTracking</key>\n\t\t\t<false/>',
        '<key>NSPrivacyCollectedDataTypeTracking</key>\n\t\t\t<true/>',
      );
      expect(() => verifyPrivacyManifest(changed)).toThrow(/tracking false/);
    });

    it('rejects a missing approved data declaration', () => {
      const changed = readManifest().replace(
        '<string>NSPrivacyCollectedDataTypePhoneNumber</string>',
        '<string>NSPrivacyCollectedDataTypePhysicalAddress</string>',
      );
      expect(() => verifyPrivacyManifest(changed)).toThrow(/PhoneNumber/);
    });
  });

  it('rejects a tracking or advertising SDK without a privacy review', () => {
    expect(() =>
      verifyNoTrackingDependencies({
        dependencies: { 'posthog-react-native': 'latest' },
      }),
    ).toThrow(/privacy review/);
  });
});
