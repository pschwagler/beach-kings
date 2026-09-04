#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const plist = require('@expo/plist').default;
const { verifyProductionExport } = require('./verify-production-no-dev-auth');

const EXPECTED = Object.freeze({
  bundleIdentifier: 'com.beachleague.app',
  appStoreUrl: 'https://apps.apple.com/app/id6801891670',
  displayName: 'Beach League',
  version: '1.0.0',
  buildNumber: '1',
  googleRedirectScheme:
    'com.googleusercontent.apps.817191446075-ddkmr5ml8quamvf5258dp9tbuabfv4rc',
  locationPurpose:
    'Beach League uses your location to suggest the nearest league location.',
  motionPurpose:
    'Beach League uses motion activity to support location features when helping you find nearby courts.',
  easImage: 'macos-tahoe-26.5-xcode-26.6',
});

const EXPECTED_PRIVACY_DATA_TYPES = Object.freeze([
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypePhoneNumber',
  'NSPrivacyCollectedDataTypeCoarseLocation',
  'NSPrivacyCollectedDataTypeSensitiveInfo',
  'NSPrivacyCollectedDataTypeEmailsOrTextMessages',
  'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypeGameplayContent',
  'NSPrivacyCollectedDataTypeCustomerSupport',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypeDeviceID',
  'NSPrivacyCollectedDataTypeOtherDiagnosticData',
]);

const EXPECTED_REQUIRED_REASON_CATEGORIES = Object.freeze([
  'NSPrivacyAccessedAPICategoryFileTimestamp',
  'NSPrivacyAccessedAPICategoryUserDefaults',
  'NSPrivacyAccessedAPICategorySystemBootTime',
  'NSPrivacyAccessedAPICategoryDiskSpace',
]);

const TRACKING_OR_ADVERTISING_DEPENDENCIES = Object.freeze([
  '@amplitude/analytics-react-native',
  '@react-native-firebase/analytics',
  '@segment/analytics-react-native',
  'expo-tracking-transparency',
  'mixpanel-react-native',
  'posthog-react-native',
  'react-native-fbsdk-next',
  'react-native-google-mobile-ads',
]);

function fail(message) {
  throw new Error(`iOS release preflight failed: ${message}`);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assertSecureProductionOrigin(
  value,
  environmentVariable = 'EXPO_PUBLIC_API_URL',
) {
  if (!value || value.trim() === '')
    fail(`${environmentVariable} is required.`);

  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${environmentVariable} must be a valid absolute URL.`);
  }

  const hostname = url.hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    fail(`${environmentVariable} cannot use localhost.`);
  }
  if (url.protocol !== 'https:') fail(`${environmentVariable} must use HTTPS.`);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    fail(`${environmentVariable} must be an HTTPS origin without a path.`);
  }
  return url.origin;
}

function assertOccurrences(source, expression, expectedCount, description) {
  const count = [...source.matchAll(expression)].length;
  if (count !== expectedCount) {
    fail(
      `${description}; expected ${expectedCount} matching build configurations, found ${count}.`,
    );
  }
}

function countLiteral(source, value) {
  return source.split(value).length - 1;
}

function verifyPrivacyManifest(source) {
  if (!source.includes('<key>NSPrivacyCollectedDataTypes</key>')) {
    fail('privacy manifest does not declare collected data types.');
  }
  if (!/<key>NSPrivacyTracking<\/key>\s*<false\s*\/>/.test(source)) {
    fail('privacy manifest must declare top-level tracking false.');
  }

  for (const dataType of EXPECTED_PRIVACY_DATA_TYPES) {
    if (countLiteral(source, `<string>${dataType}</string>`) !== 1) {
      fail(`privacy manifest must declare ${dataType} exactly once.`);
    }
  }
  for (const category of EXPECTED_REQUIRED_REASON_CATEGORIES) {
    if (countLiteral(source, `<string>${category}</string>`) !== 1) {
      fail(`privacy manifest must declare ${category} exactly once.`);
    }
  }

  const linkedTrueCount = [
    ...source.matchAll(
      /<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\s*\/>/g,
    ),
  ].length;
  if (linkedTrueCount !== EXPECTED_PRIVACY_DATA_TYPES.length) {
    fail(
      'every collected data type must use the approved linked-to-user declaration.',
    );
  }

  const collectionTrackingFalseCount = [
    ...source.matchAll(
      /<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\s*\/>/g,
    ),
  ].length;
  if (collectionTrackingFalseCount !== EXPECTED_PRIVACY_DATA_TYPES.length) {
    fail('every collected data type must declare tracking false.');
  }

  const appFunctionalityCount = countLiteral(
    source,
    '<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>',
  );
  if (appFunctionalityCount !== EXPECTED_PRIVACY_DATA_TYPES.length) {
    fail(
      'every collected data type must use the approved App Functionality purpose.',
    );
  }

  for (const unapprovedType of [
    'NSPrivacyCollectedDataTypePreciseLocation',
    'NSPrivacyCollectedDataTypeProductInteraction',
    'NSPrivacyCollectedDataTypeAdvertisingData',
    'NSPrivacyCollectedDataTypeCrashData',
    'NSPrivacyCollectedDataTypePerformanceData',
  ]) {
    if (source.includes(`<string>${unapprovedType}</string>`)) {
      fail(
        `privacy manifest contains an unapproved current-build declaration: ${unapprovedType}.`,
      );
    }
  }

  return {
    collectedDataTypeCount: EXPECTED_PRIVACY_DATA_TYPES.length,
    requiredReasonCategoryCount: EXPECTED_REQUIRED_REASON_CATEGORIES.length,
    tracking: false,
  };
}

function lintPropertyList(file) {
  try {
    plist.parse(read(file));
  } catch {
    fail(`invalid property list: ${path.relative(process.cwd(), file)}.`);
  }
}

function verifyNoTrackingDependencies(packageJson) {
  const installed = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
  const blocked = TRACKING_OR_ADVERTISING_DEPENDENCIES.filter((dependency) =>
    installed.has(dependency),
  );
  if (blocked.length > 0) {
    fail(
      `tracking or advertising dependency requires privacy review: ${blocked.join(', ')}.`,
    );
  }
}

function verifyV1OtaPolicy(packageJson, appConfig) {
  const directDependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };
  if (directDependencies['expo-updates'] != null) {
    fail('expo-updates must not be installed while the v1 no-OTA policy is active.');
  }
  if (appConfig.updates?.enabled !== false) {
    fail('Expo updates must be explicitly disabled for v1.');
  }
  if (appConfig.runtimeVersion != null) {
    fail('runtimeVersion belongs to the deferred OTA rollout policy, not v1.');
  }
}

function verifyV1SentryPolicy(easConfig) {
  for (const profile of ['development-simulator', 'preview', 'production']) {
    const environment = easConfig.build?.[profile]?.env;
    if (environment?.SENTRY_DISABLE_AUTO_UPLOAD !== 'true') {
      fail(`${profile} must disable Sentry auto upload for v1.`);
    }
    if (environment?.EXPO_PUBLIC_SENTRY_DSN !== '') {
      fail(`${profile} must explicitly disable the Sentry runtime DSN for v1.`);
    }
  }
}

function verifyStoreUrls(appConfig) {
  if (appConfig.ios?.appStoreUrl !== EXPECTED.appStoreUrl) {
    fail('Expo iOS App Store URL is missing or unexpected.');
  }
  if (
    appConfig.android != null &&
    Object.prototype.hasOwnProperty.call(appConfig.android, 'playStoreUrl')
  ) {
    fail('Android store URL must remain deferred until its listing is approved.');
  }
  return { appStoreUrl: EXPECTED.appStoreUrl };
}

function verifyReleaseConfiguration({
  mobileRoot,
  apiUrl,
  webUrl,
  exportDirectory,
}) {
  const appConfig = JSON.parse(read(path.join(mobileRoot, 'app.json'))).expo;
  const packageJson = JSON.parse(read(path.join(mobileRoot, 'package.json')));
  const easConfig = JSON.parse(read(path.join(mobileRoot, 'eas.json')));
  const project = read(
    path.join(mobileRoot, 'ios/BeachLeague.xcodeproj/project.pbxproj'),
  );
  const infoPlist = read(path.join(mobileRoot, 'ios/BeachLeague/Info.plist'));
  const entitlementsPath = path.join(
    mobileRoot,
    'ios/BeachLeague/BeachLeague.entitlements',
  );
  const entitlements = read(entitlementsPath);
  const privacyManifestPath = path.join(
    mobileRoot,
    'ios/BeachLeague/PrivacyInfo.xcprivacy',
  );
  const privacyManifest = read(privacyManifestPath);

  lintPropertyList(entitlementsPath);
  if (
    appConfig.ios?.entitlements?.['com.apple.developer.declared-age-range'] !==
    true
  ) {
    fail('Expo must enable the Declared Age Range entitlement.');
  }
  if (
    !/<key>com\.apple\.developer\.declared-age-range<\/key>\s*<true\s*\/>/.test(
      entitlements,
    )
  ) {
    fail('native Declared Age Range entitlement is missing.');
  }

  verifyNoTrackingDependencies(packageJson);
  verifyV1OtaPolicy(packageJson, appConfig);
  verifyV1SentryPolicy(easConfig);
  const storeUrls = verifyStoreUrls(appConfig);

  if (appConfig.name !== EXPECTED.displayName)
    fail('unexpected home-screen display name.');
  if (appConfig.version !== EXPECTED.version)
    fail('Expo and release version differ.');
  if (appConfig.ios?.bundleIdentifier !== EXPECTED.bundleIdentifier) {
    fail('unexpected Expo iOS bundle identifier.');
  }
  if (appConfig.ios?.supportsTablet !== false)
    fail('Expo must be iPhone-only.');
  if (appConfig.ios?.config?.usesNonExemptEncryption !== false) {
    fail('Expo must declare that the app does not use non-exempt encryption.');
  }
  const expoUrlSchemes = (appConfig.ios?.infoPlist?.CFBundleURLTypes ?? [])
    .flatMap((entry) => entry.CFBundleURLSchemes ?? []);
  if (!expoUrlSchemes.includes(EXPECTED.googleRedirectScheme)) {
    fail('Expo Google redirect scheme is missing or changed.');
  }

  assertOccurrences(
    project,
    /PRODUCT_BUNDLE_IDENTIFIER = com\.beachleague\.app;/g,
    2,
    'unexpected native bundle identifier',
  );
  assertOccurrences(
    project,
    /MARKETING_VERSION = 1\.0\.0;/g,
    2,
    'unexpected native marketing version',
  );
  assertOccurrences(
    project,
    /CURRENT_PROJECT_VERSION = 1;/g,
    2,
    'unexpected native build number',
  );
  assertOccurrences(
    project,
    /TARGETED_DEVICE_FAMILY = 1;/g,
    2,
    'native target must be iPhone-only',
  );

  if (!infoPlist.includes(`<string>${EXPECTED.displayName}</string>`)) {
    fail('native display name differs from the release name.');
  }
  if (!infoPlist.includes('<string>$(MARKETING_VERSION)</string>')) {
    fail('Info.plist must source the version from Xcode build settings.');
  }
  if (!infoPlist.includes('<string>$(CURRENT_PROJECT_VERSION)</string>')) {
    fail('Info.plist must source the build number from Xcode build settings.');
  }
  if (!infoPlist.includes(`<string>${EXPECTED.locationPurpose}</string>`)) {
    fail('location purpose declaration is missing or changed.');
  }
  if (!infoPlist.includes(`<string>${EXPECTED.motionPurpose}</string>`)) {
    fail('motion purpose declaration is missing or changed.');
  }
  if (
    !/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\s*\/>/.test(
      infoPlist,
    )
  ) {
    fail('native exempt-encryption declaration is missing or enabled.');
  }
  assertOccurrences(
    infoPlist,
    new RegExp(`<string>${EXPECTED.googleRedirectScheme}<\\/string>`, 'g'),
    1,
    'native Google redirect scheme is missing or duplicated',
  );

  lintPropertyList(privacyManifestPath);
  const privacy = verifyPrivacyManifest(privacyManifest);
  assertOccurrences(
    project,
    /PrivacyInfo\.xcprivacy in Resources/g,
    2,
    'privacy manifest must be included once in the app target resources',
  );
  for (const forbiddenKey of [
    'NSCameraUsageDescription',
    'NSFaceIDUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'UISupportedInterfaceOrientations~ipad',
  ]) {
    if (infoPlist.includes(`<key>${forbiddenKey}</key>`)) {
      fail(
        `unused or iPad-only Info.plist declaration remains: ${forbiddenKey}.`,
      );
    }
  }

  for (const profile of ['development-simulator', 'preview', 'production']) {
    if (easConfig.build?.[profile]?.ios?.image !== EXPECTED.easImage) {
      fail(`${profile} is not pinned to ${EXPECTED.easImage}.`);
    }
  }
  if (easConfig.cli?.appVersionSource !== 'remote')
    fail('EAS must use remote build numbers.');
  if (easConfig.build?.production?.autoIncrement !== true) {
    fail('the EAS production profile must auto-increment builds.');
  }
  if (
    easConfig.build?.preview?.env?.EXPO_PUBLIC_API_URL !==
    'https://dev.beachleaguevb.com'
  ) {
    fail('the preview API origin is unexpected.');
  }
  if (
    easConfig.build?.production?.env?.EXPO_PUBLIC_API_URL !==
    'https://beachleaguevb.com'
  ) {
    fail('the production API origin is unexpected.');
  }
  if (
    easConfig.build?.['development-simulator']?.env?.EXPO_PUBLIC_WEB_URL !==
    'http://localhost:3000'
  ) {
    fail('the development web origin is unexpected.');
  }
  if (
    easConfig.build?.preview?.env?.EXPO_PUBLIC_WEB_URL !==
    'https://dev.beachleaguevb.com'
  ) {
    fail('the preview web origin is unexpected.');
  }
  if (
    easConfig.build?.production?.env?.EXPO_PUBLIC_WEB_URL !==
    'https://beachleaguevb.com'
  ) {
    fail('the production web origin is unexpected.');
  }

  const apiOrigin = assertSecureProductionOrigin(apiUrl);
  const webOrigin = assertSecureProductionOrigin(webUrl, 'EXPO_PUBLIC_WEB_URL');
  const exportResult = verifyProductionExport(exportDirectory, ['ios']);
  return {
    apiOrigin,
    appStoreUrl: storeUrls.appStoreUrl,
    bundleIdentifier: EXPECTED.bundleIdentifier,
    deviceFamily: 'iPhone',
    exportFileCount: exportResult.scannedFileCount,
    privacyCollectedDataTypeCount: privacy.collectedDataTypeCount,
    version: `${EXPECTED.version} (${EXPECTED.buildNumber})`,
    webOrigin,
  };
}

function parseExportDirectory(argv, mobileRoot) {
  const flagIndex = argv.indexOf('--export-dir');
  if (flagIndex === -1) return path.join(mobileRoot, 'dist');
  if (!argv[flagIndex + 1]) fail('--export-dir requires a path.');
  return path.resolve(argv[flagIndex + 1]);
}

if (require.main === module) {
  try {
    const mobileRoot = path.resolve(__dirname, '..');
    const result = verifyReleaseConfiguration({
      mobileRoot,
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      webUrl: process.env.EXPO_PUBLIC_WEB_URL,
      exportDirectory: parseExportDirectory(process.argv.slice(2), mobileRoot),
    });
    console.log(
      `iOS release preflight passed: ${result.bundleIdentifier}, ${result.version}, ${result.deviceFamily}, API ${result.apiOrigin}, web ${result.webOrigin}; scanned ${result.exportFileCount} export files.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  assertSecureProductionOrigin,
  verifyNoTrackingDependencies,
  verifyPrivacyManifest,
  verifyReleaseConfiguration,
  verifyStoreUrls,
  verifyV1OtaPolicy,
  verifyV1SentryPolicy,
};
