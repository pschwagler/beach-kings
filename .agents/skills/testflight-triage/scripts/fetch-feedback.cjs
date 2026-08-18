#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_APP_ID = '6801891670';
const DEFAULT_WORKSPACE = '.testflight-triage';
const API_ORIGIN = 'https://api.appstoreconnect.apple.com';
const CREDENTIALS_FILENAME = '.testflight-triage-credentials.json';

class SafeError extends Error {}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function createJwt({ issuerId, keyId, privateKey }, now = Date.now()) {
  if (!issuerId || !keyId || !privateKey) {
    throw new SafeError('Credentials metadata is missing a required value.');
  }
  const issuedAt = Math.floor(now / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: issuerId,
    iat: issuedAt,
    exp: issuedAt + 19 * 60,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  let signature;
  try {
    signature = crypto.sign('sha256', Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    });
  } catch {
    throw new SafeError('The App Store Connect private key is invalid.');
  }
  return `${signingInput}.${signature.toString('base64url')}`;
}

function parseArgs(argv) {
  const result = { appId: DEFAULT_APP_ID, workspace: DEFAULT_WORKSPACE };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--app-id', '--workspace', '--since'].includes(flag) || !argv[index + 1]) {
      throw new SafeError('Usage: fetch-feedback.cjs [--app-id ID] [--workspace PATH] [--since ISO_DATE]');
    }
    const value = argv[++index];
    if (flag === '--app-id') result.appId = value;
    if (flag === '--workspace') result.workspace = value;
    if (flag === '--since') result.since = value;
  }
  if (!/^\d+$/.test(result.appId)) throw new SafeError('The app ID must contain digits only.');
  if (result.since && Number.isNaN(Date.parse(result.since))) {
    throw new SafeError('The --since value must be a valid ISO date.');
  }
  result.workspace = path.resolve(result.workspace);
  return result;
}

async function findCredentialsFile(env = process.env, home = os.homedir()) {
  if (env.TESTFLIGHT_TRIAGE_CREDENTIALS) {
    return path.resolve(env.TESTFLIGHT_TRIAGE_CREDENTIALS);
  }
  const candidates = [
    path.join(home, '.private_keys', CREDENTIALS_FILENAME),
    path.join(home, '.appstoreconnect', CREDENTIALS_FILENAME),
    path.join(home, 'Downloads', CREDENTIALS_FILENAME),
  ];
  for (const candidate of candidates) {
    try {
      await fsp.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch {}
  }
  const configRoot = path.join(home, '.config');
  const pending = [configRoot];
  while (pending.length) {
    const directory = pending.pop();
    let entries;
    try {
      entries = await fsp.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      if (entry.isFile() && entry.name === CREDENTIALS_FILENAME) return candidate;
    }
  }
  throw new SafeError('App Store Connect credentials metadata was not found.');
}

async function loadCredentials(metadataPath) {
  let metadata;
  try {
    metadata = JSON.parse(await fsp.readFile(metadataPath, 'utf8'));
  } catch {
    throw new SafeError('Credentials metadata is missing or invalid.');
  }
  const keyPath = path.resolve(path.dirname(metadataPath), metadata.privateKeyFile || '');
  let privateKey;
  try {
    const [metadataStat, keyStat] = await Promise.all([fsp.stat(metadataPath), fsp.stat(keyPath)]);
    if ((metadataStat.mode & 0o077) !== 0 || (keyStat.mode & 0o077) !== 0) {
      throw new SafeError('Credential files must have owner-only permissions.');
    }
    privateKey = await fsp.readFile(keyPath, 'utf8');
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError('The protected App Store Connect private key was not found.');
  }
  if (typeof metadata.issuerId !== 'string' || typeof metadata.keyId !== 'string') {
    throw new SafeError('Credentials metadata is missing a required value.');
  }
  return { issuerId: metadata.issuerId.trim(), keyId: metadata.keyId.trim(), privateKey };
}

async function initializeCredentialsMetadata(privateKeyPath, issuerId = '') {
  const resolvedKeyPath = path.resolve(privateKeyPath);
  const match = /^AuthKey_([a-zA-Z0-9]+)\.p8$/.exec(path.basename(resolvedKeyPath));
  if (!match) throw new SafeError('The private key filename must use Apple AuthKey_<KEY_ID>.p8 format.');
  const keyStat = await fsp.stat(resolvedKeyPath).catch(() => null);
  if (!keyStat || (keyStat.mode & 0o077) !== 0) {
    throw new SafeError('The App Store Connect private key must exist with owner-only permissions.');
  }
  const metadataPath = path.join(path.dirname(resolvedKeyPath), CREDENTIALS_FILENAME);
  await fsp.writeFile(metadataPath, `${JSON.stringify({
    issuerId,
    keyId: match[1],
    privateKeyFile: path.basename(resolvedKeyPath),
  }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return metadataPath;
}

function safeApiUrl(value) {
  const url = new URL(value, API_ORIGIN);
  if (url.origin !== API_ORIGIN || !url.pathname.startsWith('/v1/')) {
    throw new SafeError('App Store Connect returned an invalid pagination link.');
  }
  return url;
}

async function requestJson(url, token, fetchImpl = globalThis.fetch) {
  const safeUrl = safeApiUrl(url);
  let response;
  try {
    response = await fetchImpl(safeUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch {
    throw new SafeError('App Store Connect could not be reached.');
  }
  if (!response.ok) {
    throw new SafeError(`App Store Connect request failed with status ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new SafeError('App Store Connect returned an invalid response.');
  }
}

async function fetchPages(initialUrl, token, fetchImpl = globalThis.fetch) {
  const records = [];
  const included = new Map();
  let next = initialUrl;
  const visited = new Set();
  while (next) {
    const normalized = safeApiUrl(next).toString();
    if (visited.has(normalized)) throw new SafeError('App Store Connect pagination repeated a page.');
    visited.add(normalized);
    const document = await requestJson(normalized, token, fetchImpl);
    if (!Array.isArray(document.data)) throw new SafeError('App Store Connect returned invalid feedback data.');
    records.push(...document.data);
    for (const item of document.included || []) included.set(`${item.type}:${item.id}`, item);
    next = document.links && document.links.next;
  }
  return { records, included: [...included.values()] };
}

function extensionFor(contentType, url) {
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/jpeg') return '.jpg';
  if (contentType === 'image/heic') return '.heic';
  const suffix = path.extname(new URL(url).pathname).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(suffix) ? suffix : '.img';
}

async function downloadScreenshot(image, destinationBase, fetchImpl = globalThis.fetch) {
  if (!image || typeof image.url !== 'string') throw new SafeError('Screenshot feedback is missing its attachment URL.');
  let response;
  try {
    response = await fetchImpl(image.url, { method: 'GET', redirect: 'follow' });
  } catch {
    throw new SafeError('A screenshot attachment could not be downloaded.');
  }
  if (!response.ok) throw new SafeError(`A screenshot attachment failed with status ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const destination = `${destinationBase}${extensionFor(response.headers.get('content-type'), image.url)}`;
  await fsp.writeFile(destination, bytes, { mode: 0o600 });
  return destination;
}

function sanitizeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function localizeScreenshots(record, workspace, fetchImpl = globalThis.fetch) {
  const screenshots = Array.isArray(record.attributes && record.attributes.screenshots)
    ? record.attributes.screenshots
    : [];
  const localized = [];
  for (let index = 0; index < screenshots.length; index += 1) {
    const image = screenshots[index];
    const prefix = path.join(workspace, 'screenshots', `${sanitizeId(record.id)}-${index + 1}`);
    const existing = (await fsp.readdir(path.dirname(prefix))).find((name) =>
      name.startsWith(`${path.basename(prefix)}.`));
    const localPath = existing ? path.join(path.dirname(prefix), existing) : await downloadScreenshot(image, prefix, fetchImpl);
    localized.push({
      width: image.width,
      height: image.height,
      expirationDate: image.expirationDate,
      localPath: path.relative(workspace, localPath),
    });
  }
  return { ...record, attributes: { ...record.attributes, screenshots: localized } };
}

function mergeById(existing, incoming) {
  const merged = new Map();
  for (const record of [...existing, ...incoming]) merged.set(record.id, record);
  return [...merged.values()].sort((left, right) => {
    const dateOrder = String(left.attributes?.createdDate || '').localeCompare(String(right.attributes?.createdDate || ''));
    return dateOrder || left.id.localeCompare(right.id);
  });
}

function mergeResources(existing, incoming) {
  const merged = new Map();
  for (const record of [...existing, ...incoming]) merged.set(`${record.type}:${record.id}`, record);
  return [...merged.values()];
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new SafeError('The private workspace contains invalid JSON.');
  }
}

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fsp.rename(temporary, file);
}

function buildFeedbackUrl(appId, kind) {
  const fields = kind === 'screenshot'
    ? 'createdDate,comment,email,deviceModel,osVersion,locale,timeZone,architecture,connectionType,pairedAppleWatch,appUptimeInMilliseconds,diskBytesAvailable,diskBytesTotal,batteryPercentage,screenWidthInPoints,screenHeightInPoints,appPlatform,devicePlatform,deviceFamily,buildBundleId,screenshots,build,tester'
    : 'createdDate,comment,email,deviceModel,osVersion,locale,timeZone,architecture,connectionType,pairedAppleWatch,appUptimeInMilliseconds,diskBytesAvailable,diskBytesTotal,batteryPercentage,screenWidthInPoints,screenHeightInPoints,appPlatform,devicePlatform,deviceFamily,buildBundleId,crashLog,build,tester';
  const resource = kind === 'screenshot' ? 'betaFeedbackScreenshotSubmissions' : 'betaFeedbackCrashSubmissions';
  const url = new URL(`/v1/apps/${appId}/${resource}`, API_ORIGIN);
  url.searchParams.set(`fields[${resource}]`, fields);
  url.searchParams.set('include', 'build,tester');
  url.searchParams.set('limit', '200');
  url.searchParams.set('sort', 'createdDate');
  return url;
}

async function syncFeedback(options, dependencies = {}) {
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const now = dependencies.now || Date.now();
  const workspace = options.workspace;
  await Promise.all([
    fsp.mkdir(path.join(workspace, 'raw'), { recursive: true, mode: 0o700 }),
    fsp.mkdir(path.join(workspace, 'screenshots'), { recursive: true, mode: 0o700 }),
    ...['issues', 'plans', 'reviews', 'evidence', 'batches'].map((folder) =>
      fsp.mkdir(path.join(workspace, folder), { recursive: true, mode: 0o700 })),
  ]);
  await Promise.all(['', 'raw', 'screenshots', 'issues', 'plans', 'reviews', 'evidence', 'batches'].map((folder) =>
    fsp.chmod(path.join(workspace, folder), 0o700)));
  const metadataPath = options.credentialsPath || await findCredentialsFile();
  const token = createJwt(await loadCredentials(metadataPath), now);
  const [screenshotsPage, crashesPage] = await Promise.all([
    fetchPages(buildFeedbackUrl(options.appId, 'screenshot'), token, fetchImpl),
    fetchPages(buildFeedbackUrl(options.appId, 'crash'), token, fetchImpl),
  ]);
  const since = options.since ? Date.parse(options.since) : -Infinity;
  const screenshots = screenshotsPage.records.filter((item) => Date.parse(item.attributes?.createdDate) >= since);
  const crashes = crashesPage.records.filter((item) => Date.parse(item.attributes?.createdDate) >= since);
  const localized = [];
  for (const record of screenshots) localized.push(await localizeScreenshots(record, workspace, fetchImpl));
  const feedbackFile = path.join(workspace, 'raw', 'feedback.json');
  const previous = await readJson(feedbackFile, { records: [], included: [] });
  const records = mergeById(previous.records || [], [...localized, ...crashes]);
  const included = mergeResources(previous.included || [], [...screenshotsPage.included, ...crashesPage.included]);
  const syncedAt = new Date(now).toISOString();
  await writeJsonAtomic(feedbackFile, { appId: options.appId, records, included });
  await writeJsonAtomic(path.join(workspace, 'state.json'), {
    appId: options.appId,
    lastSuccessfulSync: syncedAt,
    screenshotCount: records.filter((item) => item.type === 'betaFeedbackScreenshotSubmissions').length,
    crashCount: records.filter((item) => item.type === 'betaFeedbackCrashSubmissions').length,
  });
  return {
    screenshotCount: records.filter((item) => item.type === 'betaFeedbackScreenshotSubmissions').length,
    crashCount: records.filter((item) => item.type === 'betaFeedbackCrashSubmissions').length,
    workspace,
  };
}

async function main(argv = process.argv.slice(2)) {
  try {
    const result = await syncFeedback(parseArgs(argv));
    process.stdout.write(`Screenshot submissions: ${result.screenshotCount}\n`);
    process.stdout.write(`Crash submissions: ${result.crashCount}\n`);
    process.stdout.write(`Private workspace: ${result.workspace}\n`);
  } catch (error) {
    const message = error instanceof SafeError ? error.message : 'TestFlight feedback synchronization failed.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  SafeError,
  buildFeedbackUrl,
  createJwt,
  downloadScreenshot,
  fetchPages,
  initializeCredentialsMetadata,
  loadCredentials,
  mergeById,
  parseArgs,
  requestJson,
  syncFeedback,
};

if (require.main === module) main();
