#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { verifyProductionExport } = require('./verify-production-no-dev-auth');

const EXPECTED = Object.freeze({
  bundleIdentifier: 'com.beachleague.app',
  displayName: 'Beach League',
  version: '1.0.0',
  buildNumber: '1',
  locationPurpose:
    'Beach League uses your location to suggest the nearest league location.',
  easImage: 'macos-sequoia-15.6-xcode-26.2',
});

function fail(message) {
  throw new Error(`iOS release preflight failed: ${message}`);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assertSecureProductionOrigin(value) {
  if (!value || value.trim() === '') fail('EXPO_PUBLIC_API_URL is required.');

  let url;
  try {
    url = new URL(value);
  } catch {
    fail('EXPO_PUBLIC_API_URL must be a valid absolute URL.');
  }

  const hostname = url.hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    fail('EXPO_PUBLIC_API_URL cannot use localhost.');
  }
  if (url.protocol !== 'https:') fail('EXPO_PUBLIC_API_URL must use HTTPS.');
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    fail('EXPO_PUBLIC_API_URL must be an HTTPS origin without a path.');
  }
  return url.origin;
}

function assertOccurrences(source, expression, expectedCount, description) {
  const count = [...source.matchAll(expression)].length;
  if (count !== expectedCount) {
    fail(`${description}; expected ${expectedCount} matching build configurations, found ${count}.`);
  }
}

function verifyReleaseConfiguration({
  mobileRoot,
  apiUrl,
  exportDirectory,
}) {
  const appConfig = JSON.parse(read(path.join(mobileRoot, 'app.json'))).expo;
  const easConfig = JSON.parse(read(path.join(mobileRoot, 'eas.json')));
  const project = read(
    path.join(mobileRoot, 'ios/BeachLeague.xcodeproj/project.pbxproj'),
  );
  const infoPlist = read(path.join(mobileRoot, 'ios/BeachLeague/Info.plist'));

  if (appConfig.name !== EXPECTED.displayName) fail('unexpected home-screen display name.');
  if (appConfig.version !== EXPECTED.version) fail('Expo and release version differ.');
  if (appConfig.ios?.bundleIdentifier !== EXPECTED.bundleIdentifier) {
    fail('unexpected Expo iOS bundle identifier.');
  }
  if (appConfig.ios?.supportsTablet !== false) fail('Expo must be iPhone-only.');

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
  for (const forbiddenKey of [
    'NSCameraUsageDescription',
    'NSFaceIDUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'UISupportedInterfaceOrientations~ipad',
  ]) {
    if (infoPlist.includes(`<key>${forbiddenKey}</key>`)) {
      fail(`unused or iPad-only Info.plist declaration remains: ${forbiddenKey}.`);
    }
  }

  for (const profile of ['development-simulator', 'preview', 'production']) {
    if (easConfig.build?.[profile]?.ios?.image !== EXPECTED.easImage) {
      fail(`${profile} is not pinned to ${EXPECTED.easImage}.`);
    }
  }
  if (easConfig.cli?.appVersionSource !== 'remote') fail('EAS must use remote build numbers.');
  if (easConfig.build?.production?.autoIncrement !== true) {
    fail('the EAS production profile must auto-increment builds.');
  }
  if (easConfig.build?.preview?.env?.EXPO_PUBLIC_API_URL !== 'https://dev.beachleaguevb.com') {
    fail('the preview API origin is unexpected.');
  }
  if (easConfig.build?.production?.env?.EXPO_PUBLIC_API_URL !== 'https://beachleaguevb.com') {
    fail('the production API origin is unexpected.');
  }

  const origin = assertSecureProductionOrigin(apiUrl);
  const exportResult = verifyProductionExport(exportDirectory, ['ios']);
  return {
    apiOrigin: origin,
    bundleIdentifier: EXPECTED.bundleIdentifier,
    deviceFamily: 'iPhone',
    exportFileCount: exportResult.scannedFileCount,
    version: `${EXPECTED.version} (${EXPECTED.buildNumber})`,
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
      exportDirectory: parseExportDirectory(process.argv.slice(2), mobileRoot),
    });
    console.log(
      `iOS release preflight passed: ${result.bundleIdentifier}, ${result.version}, ${result.deviceFamily}, ${result.apiOrigin}; scanned ${result.exportFileCount} export files.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { assertSecureProductionOrigin, verifyReleaseConfiguration };
