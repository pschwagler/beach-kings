'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const client = require('./fetch-feedback.cjs');

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'testflight-triage-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('constructs a valid ES256 App Store Connect JWT', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const now = Date.parse('2026-08-16T12:00:00Z');
  const token = client.createJwt({ issuerId: 'issuer', keyId: 'key', privateKey }, now);
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url'));
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url'));
  assert.deepEqual(header, { alg: 'ES256', kid: 'key', typ: 'JWT' });
  assert.equal(payload.iss, 'issuer');
  assert.equal(payload.aud, 'appstoreconnect-v1');
  assert.equal(payload.exp - payload.iat, 19 * 60);
  assert.equal(crypto.verify('sha256', Buffer.from(`${encodedHeader}.${encodedPayload}`), {
    key: publicKey,
    dsaEncoding: 'ieee-p1363',
  }, Buffer.from(encodedSignature, 'base64url')), true);
});

test('reports API status without leaking response content', async () => {
  const fetchImpl = async () => jsonResponse({ errors: [{ detail: 'private tester content' }] }, 403);
  await assert.rejects(
    client.requestJson('/v1/apps/1', 'secret-token', fetchImpl),
    (error) => error.message === 'App Store Connect request failed with status 403.' &&
      !error.message.includes('private tester content') && !error.message.includes('secret-token'),
  );
});

test('follows pagination and rejects off-origin links', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url.toString());
    if (seen.length === 1) {
      return jsonResponse({ data: [{ id: 'one' }], links: { next: '/v1/next?page=2' } });
    }
    return jsonResponse({ data: [{ id: 'two' }], links: {} });
  };
  const result = await client.fetchPages('/v1/first', 'token', fetchImpl);
  assert.deepEqual(result.records.map((record) => record.id), ['one', 'two']);
  assert.equal(seen.length, 2);
  await assert.rejects(
    client.fetchPages('https://example.com/v1/feedback', 'token', fetchImpl),
    /invalid pagination link/,
  );
});

test('merges idempotently by Apple feedback ID', () => {
  const oldRecord = { type: 'betaFeedbackScreenshotSubmissions', id: 'same', attributes: { comment: 'old' } };
  const updated = { type: 'betaFeedbackScreenshotSubmissions', id: 'same', attributes: { comment: 'new' } };
  const crash = { type: 'betaFeedbackCrashSubmissions', id: 'crash', attributes: {} };
  const once = client.mergeById([oldRecord], [updated, crash]);
  const twice = client.mergeById(once, [updated, crash]);
  assert.equal(once.length, 2);
  assert.deepEqual(twice, once);
  assert.equal(once.find((record) => record.id === 'same').attributes.comment, 'new');
});

test('downloads screenshot bytes with an owner-only file mode', async (t) => {
  const directory = await temporaryDirectory(t);
  const destinationBase = path.join(directory, 'feedback-1');
  const fetchImpl = async () => new Response(Buffer.from('image bytes'), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
  const destination = await client.downloadScreenshot(
    { url: 'https://example.invalid/signed', width: 1, height: 1 },
    destinationBase,
    fetchImpl,
  );
  assert.equal(destination, `${destinationBase}.png`);
  assert.equal(await fs.readFile(destination, 'utf8'), 'image bytes');
  assert.equal((await fs.stat(destination)).mode & 0o777, 0o600);
});

test('rejects missing, invalid, and broadly readable credentials', async (t) => {
  const directory = await temporaryDirectory(t);
  await assert.rejects(client.loadCredentials(path.join(directory, 'missing.json')), /missing or invalid/);
  const metadata = path.join(directory, 'credentials.json');
  await fs.writeFile(metadata, '{invalid', { mode: 0o600 });
  await assert.rejects(client.loadCredentials(metadata), /missing or invalid/);

  const key = path.join(directory, 'key.p8');
  await fs.writeFile(key, 'not a key', { mode: 0o600 });
  await fs.writeFile(metadata, JSON.stringify({ issuerId: 'issuer', keyId: 'key', privateKeyFile: 'key.p8' }), { mode: 0o644 });
  await fs.chmod(metadata, 0o644);
  await assert.rejects(client.loadCredentials(metadata), /owner-only permissions/);
  await fs.chmod(metadata, 0o600);
  const credentials = await client.loadCredentials(metadata);
  assert.equal(credentials.issuerId, 'issuer');
  assert.throws(() => client.createJwt(credentials), /private key is invalid/);
});

test('initializes owner-only metadata beside a protected Apple key', async (t) => {
  const directory = await temporaryDirectory(t);
  const key = path.join(directory, 'AuthKey_TEST123.p8');
  await fs.writeFile(key, 'protected', { mode: 0o600 });
  const metadata = await client.initializeCredentialsMetadata(key, 'issuer');
  assert.equal(path.dirname(metadata), directory);
  assert.equal((await fs.stat(metadata)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await fs.readFile(metadata, 'utf8')), {
    issuerId: 'issuer', keyId: 'TEST123', privateKeyFile: 'AuthKey_TEST123.p8',
  });
  await assert.rejects(client.initializeCredentialsMetadata(key, 'issuer'), /EEXIST/);
});

test('client source has no mutating HTTP request method', async () => {
  const source = await fs.readFile(path.join(__dirname, 'fetch-feedback.cjs'), 'utf8');
  assert.equal(/method\s*:\s*['"](?:DELETE|POST|PATCH|PUT)['"]/.test(source), false);
});

test('full sync paginates, downloads, merges, and updates successful state', async (t) => {
  const directory = await temporaryDirectory(t);
  const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keyFile = path.join(directory, 'AuthKey_test.p8');
  const metadataFile = path.join(directory, '.testflight-triage-credentials.json');
  await fs.writeFile(keyFile, keyPair.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  await fs.writeFile(metadataFile, JSON.stringify({
    issuerId: 'issuer', keyId: 'key', privateKeyFile: path.basename(keyFile),
  }), { mode: 0o600 });
  const workspace = path.join(directory, 'workspace');
  let screenshotRequests = 0;
  const fetchImpl = async (url, options) => {
    const value = url.toString();
    assert.equal(options.method, 'GET');
    if (value.startsWith('https://attachment.invalid/')) {
      return new Response(Buffer.from('png'), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (value.includes('betaFeedbackScreenshotSubmissions')) {
      screenshotRequests += 1;
      return jsonResponse({
        data: [{
          type: 'betaFeedbackScreenshotSubmissions', id: 's-1',
          attributes: { createdDate: '2026-08-16T00:00:00Z', screenshots: [{ url: 'https://attachment.invalid/signed' }] },
        }],
        links: {},
      });
    }
    if (value.includes('betaFeedbackCrashSubmissions')) return jsonResponse({ data: [], links: {} });
    throw new Error('unexpected request');
  };
  const options = { appId: '6801891670', workspace, credentialsPath: metadataFile };
  const first = await client.syncFeedback(options, { fetch: fetchImpl, now: Date.parse('2026-08-16T12:00:00Z') });
  const second = await client.syncFeedback(options, { fetch: fetchImpl, now: Date.parse('2026-08-16T13:00:00Z') });
  assert.deepEqual({ screenshots: first.screenshotCount, crashes: first.crashCount }, { screenshots: 1, crashes: 0 });
  assert.equal(second.screenshotCount, 1);
  assert.equal(screenshotRequests, 2);
  const raw = JSON.parse(await fs.readFile(path.join(workspace, 'raw', 'feedback.json')));
  const state = JSON.parse(await fs.readFile(path.join(workspace, 'state.json')));
  assert.equal(raw.records.length, 1);
  assert.equal(raw.records[0].attributes.screenshots[0].url, undefined);
  assert.equal(state.lastSuccessfulSync, '2026-08-16T13:00:00.000Z');
});
