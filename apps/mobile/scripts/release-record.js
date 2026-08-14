#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const CHECK_NAMES = Object.freeze([
  'releasePreflight',
  'productionConfiguration',
  'signedArchiveInspection',
  'privacyReport',
  'appStoreProcessing',
  'testFlightSmoke',
  'demoAccount',
]);
const CHECK_STATUSES = new Set(['pending', 'passed', 'failed', 'not_applicable']);

class ReleaseRecordError extends Error {}

function fail(message) {
  throw new ReleaseRecordError(`iOS release record: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read JSON file ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function command(commandName, args, cwd) {
  return execFileSync(commandName, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function detectLocalToolchain(runCommand, cwd) {
  let xcodeVersion = null;
  let iosSdkVersion = null;
  try {
    xcodeVersion = runCommand('xcodebuild', ['-version'], cwd)
      .split('\n')[0]
      .replace(/^Xcode\s+/, '');
    iosSdkVersion = runCommand(
      'xcrun',
      ['--sdk', 'iphoneos', '--show-sdk-version'],
      cwd,
    );
  } catch {
    // Draft records may be created away from macOS. Final validation requires
    // the actual EAS toolchain values from the build log.
  }
  return { xcodeVersion, iosSdkVersion };
}

function artifactMetadata(file) {
  if (!file) return { fileName: null, sizeBytes: null, sha256: null };
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`artifact is not a readable file: ${file}.`);
  }
  const contents = fs.readFileSync(resolved);
  return {
    fileName: path.basename(resolved),
    sizeBytes: contents.byteLength,
    sha256: crypto.createHash('sha256').update(contents).digest('hex'),
  };
}

function createReleaseRecord({
  mobileRoot,
  repoRoot,
  environment = 'production',
  buildNumber = null,
  easBuildId = null,
  artifact = null,
  submitter = null,
  xcodeVersion = null,
  iosSdkVersion = null,
  toolchainSource = null,
  now = () => new Date(),
  runCommand = command,
}) {
  const appConfig = readJson(path.join(mobileRoot, 'app.json')).expo;
  const easConfig = readJson(path.join(mobileRoot, 'eas.json'));
  const profile = easConfig.build?.[environment];
  if (!profile) fail(`unknown EAS environment: ${environment}.`);

  const commitSha = runCommand('git', ['rev-parse', 'HEAD'], repoRoot);
  const clean = runCommand('git', ['status', '--porcelain'], repoRoot) === '';
  const detected = detectLocalToolchain(runCommand, repoRoot);
  const suppliedToolchain = Boolean(xcodeVersion || iosSdkVersion || toolchainSource);

  return {
    schemaVersion: SCHEMA_VERSION,
    status: 'draft',
    createdAt: now().toISOString(),
    release: {
      environment,
      bundleIdentifier: appConfig.ios?.bundleIdentifier ?? null,
      version: appConfig.version ?? null,
      buildNumber: buildNumber == null ? null : String(buildNumber),
      apiOrigin: profile.env?.EXPO_PUBLIC_API_URL ?? null,
      easBuildId,
    },
    source: { commitSha, clean },
    toolchain: {
      source: toolchainSource ?? (suppliedToolchain ? 'provided' : 'local'),
      easImage: profile.ios?.image ?? null,
      xcodeVersion: xcodeVersion ?? detected.xcodeVersion,
      iosSdkVersion: iosSdkVersion ?? detected.iosSdkVersion,
    },
    artifact: artifactMetadata(artifact),
    submitter,
    checks: Object.fromEntries(CHECK_NAMES.map((name) => [name, 'pending'])),
    approval: {
      decision: 'pending',
      releaseOwner: null,
      decidedAt: null,
      notes: null,
    },
  };
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function versionAtLeast(value, minimum) {
  if (typeof value !== 'string') return false;
  const parsed = value.split('.').map((part) => Number(part));
  if (parsed.some((part) => !Number.isInteger(part) || part < 0)) return false;
  for (let index = 0; index < Math.max(parsed.length, minimum.length); index += 1) {
    const actualPart = parsed[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;
    if (actualPart !== minimumPart) return actualPart > minimumPart;
  }
  return true;
}

function validateReleaseRecord(record, { final = false } = {}) {
  const errors = [];
  const requireValue = (condition, message) => {
    if (!condition) errors.push(message);
  };

  requireValue(record?.schemaVersion === SCHEMA_VERSION, `schemaVersion must be ${SCHEMA_VERSION}`);
  requireValue(['draft', 'approved', 'rejected'].includes(record?.status), 'status is invalid');
  requireValue(isIsoTimestamp(record?.createdAt), 'createdAt must be an ISO timestamp');
  requireValue(['preview', 'production'].includes(record?.release?.environment), 'release.environment is invalid');
  requireValue(record?.release?.bundleIdentifier === 'com.beachleague.app', 'bundle identifier is invalid');
  requireValue(/^\d+\.\d+\.\d+$/.test(record?.release?.version ?? ''), 'semantic release version is required');
  requireValue(/^https:\/\//.test(record?.release?.apiOrigin ?? ''), 'HTTPS API origin is required');
  if (record?.release?.environment === 'production') {
    requireValue(record.release.apiOrigin === 'https://beachleaguevb.com', 'production API origin is invalid');
  }
  if (record?.release?.environment === 'preview') {
    requireValue(record.release.apiOrigin === 'https://dev.beachleaguevb.com', 'preview API origin is invalid');
  }
  requireValue(/^[0-9a-f]{40}$/.test(record?.source?.commitSha ?? ''), '40-character commit SHA is required');
  requireValue(typeof record?.source?.clean === 'boolean', 'source.clean must be boolean');
  requireValue(typeof record?.toolchain?.easImage === 'string' && record.toolchain.easImage.length > 0, 'EAS image is required');

  for (const check of CHECK_NAMES) {
    requireValue(CHECK_STATUSES.has(record?.checks?.[check]), `${check} status is invalid`);
  }

  if (final) {
    requireValue(record?.status === 'approved', 'final record status must be approved');
    requireValue(record?.release?.environment === 'production', 'final record must use production');
    requireValue(/^\d+$/.test(record?.release?.buildNumber ?? ''), 'build number is required');
    requireValue(typeof record?.release?.easBuildId === 'string' && record.release.easBuildId.length > 0, 'EAS build ID is required');
    requireValue(record?.source?.clean === true, 'release commit must have a clean worktree');
    requireValue(record?.toolchain?.source === 'eas-build-log', 'toolchain must be verified from the EAS build log');
    requireValue(record?.toolchain?.easImage === 'macos-tahoe-26.5-xcode-26.6', 'approved EAS image is required');
    requireValue(versionAtLeast(record?.toolchain?.xcodeVersion, [26, 4]), 'Xcode 26.4 or later is required');
    requireValue(versionAtLeast(record?.toolchain?.iosSdkVersion, [26, 4]), 'iOS SDK 26.4 or later is required');
    requireValue(typeof record?.artifact?.fileName === 'string' && record.artifact.fileName.endsWith('.ipa'), 'IPA artifact file name is required');
    requireValue(Number.isInteger(record?.artifact?.sizeBytes) && record.artifact.sizeBytes > 0, 'artifact size is required');
    requireValue(/^[0-9a-f]{64}$/.test(record?.artifact?.sha256 ?? ''), 'artifact SHA-256 is required');
    requireValue(typeof record?.submitter === 'string' && record.submitter.trim().length > 0, 'submitter is required');
    for (const check of CHECK_NAMES) {
      requireValue(record?.checks?.[check] === 'passed', `${check} must pass`);
    }
    requireValue(record?.approval?.decision === 'go', 'release approval must be go');
    requireValue(typeof record?.approval?.releaseOwner === 'string' && record.approval.releaseOwner.trim().length > 0, 'release owner is required');
    requireValue(isIsoTimestamp(record?.approval?.decidedAt), 'approval timestamp is required');
  }

  if (errors.length > 0) fail(errors.join('; '));
  return record;
}

function parseFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) fail(`unexpected argument: ${token}.`);
    const name = token.slice(2);
    if (name === 'final') {
      flags.final = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`${token} requires a value.`);
    flags[name] = value;
    index += 1;
  }
  return flags;
}

function requiredFlag(flags, name) {
  if (!flags[name]) fail(`--${name} is required.`);
  return flags[name];
}

function writeRecord(file, record) {
  const resolved = path.resolve(file);
  if (fs.existsSync(resolved)) fail(`refusing to overwrite existing record: ${file}.`);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return resolved;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/release-record.js create --output <file> [options]',
    '  node scripts/release-record.js validate --file <file> [--final]',
    '',
    'Create options: --environment, --build-number, --eas-build-id, --artifact,',
    '  --submitter, --xcode-version, --ios-sdk-version, --toolchain-source',
  ].join('\n');
}

function main(argv) {
  const [action, ...rest] = argv;
  if (!action || action === '--help' || action === 'help') {
    console.log(usage());
    return;
  }
  const flags = parseFlags(rest);
  const mobileRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(mobileRoot, '../..');

  if (action === 'create') {
    const output = requiredFlag(flags, 'output');
    const record = createReleaseRecord({
      mobileRoot,
      repoRoot,
      environment: flags.environment ?? 'production',
      buildNumber: flags['build-number'] ?? null,
      easBuildId: flags['eas-build-id'] ?? null,
      artifact: flags.artifact ?? null,
      submitter: flags.submitter ?? null,
      xcodeVersion: flags['xcode-version'] ?? null,
      iosSdkVersion: flags['ios-sdk-version'] ?? null,
      toolchainSource: flags['toolchain-source'] ?? null,
    });
    validateReleaseRecord(record);
    const written = writeRecord(output, record);
    console.log(`Created draft iOS release record: ${written}`);
    console.log('Keep release records in the private release evidence system; do not commit them.');
    return;
  }

  if (action === 'validate') {
    const file = requiredFlag(flags, 'file');
    validateReleaseRecord(readJson(path.resolve(file)), { final: flags.final === true });
    console.log(`iOS release record is valid${flags.final ? ' and release-ready' : ''}: ${path.resolve(file)}`);
    return;
  }

  fail(`unknown action: ${action}.\n${usage()}`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  CHECK_NAMES,
  ReleaseRecordError,
  createReleaseRecord,
  validateReleaseRecord,
};
