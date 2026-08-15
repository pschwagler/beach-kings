import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  assertSecureProductionOrigin,
  verifyNoTrackingDependencies,
  verifyPrivacyManifest,
  verifyReleaseConfiguration,
  verifyV1OtaPolicy,
} = require('../../scripts/release-preflight') as {
  assertSecureProductionOrigin: (
    value: string | undefined,
    environmentVariable?: string,
  ) => string;
  verifyNoTrackingDependencies: (packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }) => void;
  verifyPrivacyManifest: (source: string) => {
    collectedDataTypeCount: number;
    requiredReasonCategoryCount: number;
    tracking: false;
  };
  verifyV1OtaPolicy: (
    packageJson: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    },
    appConfig: { updates?: { enabled?: boolean }; runtimeVersion?: unknown },
  ) => void;
  verifyReleaseConfiguration: (options: {
    mobileRoot: string;
    apiUrl: string | undefined;
    webUrl: string | undefined;
    exportDirectory: string;
  }) => {
    apiOrigin: string;
    bundleIdentifier: string;
    deviceFamily: string;
    privacyCollectedDataTypeCount: number;
    version: string;
    webOrigin: string;
  };
};

const mobileRoot = path.resolve(__dirname, '../..');

describe('iOS release preflight', () => {
  it('accepts the checked-in native release configuration', () => {
    const exportDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'bk-ios-release-preflight-'),
    );
    const bundleDirectory = path.join(
      exportDirectory,
      '_expo/static/js/ios',
    );
    fs.mkdirSync(bundleDirectory, { recursive: true });
    fs.writeFileSync(path.join(bundleDirectory, 'entry-ios.hbc'), 'clean bundle');
    fs.writeFileSync(path.join(exportDirectory, 'metadata.json'), '{}');

    try {
      expect(
        verifyReleaseConfiguration({
          mobileRoot,
          apiUrl: 'https://beachleaguevb.com',
          webUrl: 'https://beachleaguevb.com',
          exportDirectory,
        }),
      ).toEqual(
        expect.objectContaining({
          apiOrigin: 'https://beachleaguevb.com',
          bundleIdentifier: 'com.beachleague.app',
          deviceFamily: 'iPhone',
          privacyCollectedDataTypeCount: 13,
          version: '1.0.0 (1)',
          webOrigin: 'https://beachleaguevb.com',
        }),
      );
    } finally {
      fs.rmSync(exportDirectory, { recursive: true, force: true });
    }
  });

  it.each([undefined, '', 'not-a-url', 'http://beachleaguevb.com'])(
    'rejects a missing, malformed, or insecure release origin: %s',
    (value) => expect(() => assertSecureProductionOrigin(value)).toThrow(),
  );

  it('identifies missing public-web configuration separately', () => {
    expect(() =>
      assertSecureProductionOrigin(undefined, 'EXPO_PUBLIC_WEB_URL'),
    ).toThrow(/EXPO_PUBLIC_WEB_URL is required/);
  });

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

  it('rejects a missing native motion purpose declaration', () => {
    const infoPlistPath = path.join(
      mobileRoot,
      'ios/BeachLeague/Info.plist',
    );
    const original = fs.readFileSync(infoPlistPath, 'utf8');
    const changed = original.replace(
      /\s*<key>NSMotionUsageDescription<\/key>\s*<string>[^<]+<\/string>/,
      '',
    );
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'bk-ios-motion-purpose-'),
    );

    try {
      fs.cpSync(mobileRoot, temporaryRoot, { recursive: true });
      fs.writeFileSync(
        path.join(temporaryRoot, 'ios/BeachLeague/Info.plist'),
        changed,
      );
      const exportDirectory = path.join(temporaryRoot, 'dist');
      expect(() =>
        verifyReleaseConfiguration({
          mobileRoot: temporaryRoot,
          apiUrl: 'https://beachleaguevb.com',
          webUrl: 'https://beachleaguevb.com',
          exportDirectory,
        }),
      ).toThrow(/motion purpose declaration/);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  describe('v1 OTA policy', () => {
    it('accepts an app with updates explicitly disabled', () => {
      expect(() =>
        verifyV1OtaPolicy(
          { dependencies: { expo: '^57.0.0' } },
          { updates: { enabled: false } },
        ),
      ).not.toThrow();
    });

    it('rejects installing expo-updates for v1', () => {
      expect(() =>
        verifyV1OtaPolicy(
          { dependencies: { 'expo-updates': 'latest' } },
          { updates: { enabled: false } },
        ),
      ).toThrow(/must not be installed/);
    });

    it('rejects an implicit or runtime-version OTA configuration', () => {
      expect(() => verifyV1OtaPolicy({}, {})).toThrow(/explicitly disabled/);
      expect(() =>
        verifyV1OtaPolicy(
          {},
          { updates: { enabled: false }, runtimeVersion: '1.0.0' },
        ),
      ).toThrow(/deferred OTA rollout policy/);
    });
  });
});
