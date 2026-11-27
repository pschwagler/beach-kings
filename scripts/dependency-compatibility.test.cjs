'use strict';

const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const queryString = require('query-string');
const { getPathFromState } = require('expo-router/build/fork/getPathFromState');
const { getStateFromPath } = require('expo-router/build/fork/getStateFromPath');

test('Expo Router resolves the patched query-string package without a stale nested copy', () => {
  const routerRequire = createRequire(require.resolve('expo-router/package.json'));
  assert.equal(routerRequire.resolve('query-string'), require.resolve('query-string'));
  assert.equal(routerRequire('query-string'), queryString);
});

test('query-string preserves named exports and its default API', () => {
  for (const name of ['parse', 'stringify', 'parseUrl', 'stringifyUrl', 'pick', 'exclude']) {
    assert.equal(typeof queryString[name], 'function');
    assert.equal(queryString[name], queryString.default[name]);
  }
});

test('route query values retain Unicode, delimiters, arrays and empty values', () => {
  const params = { name: 'Beach League 🏐', query: 'a+b&c=d?x#y', tag: ['one', 'two'], flag: null, empty: '' };
  const encoded = queryString.stringify(params, { sort: false });
  assert.deepEqual({ ...queryString.parse(encoded) }, params);
  assert.equal(queryString.stringify({ sessionId: '42', tab: 'standings' }, { sort: false }),
    'sessionId=42&tab=standings');
});

test('malformed URI values remain readable without breaking navigation', () => {
  const values = ['%', '%G0', '%E0%A4%A', '%FE%FF', '%FF%FE', '%C2'];
  for (const value of values) {
    const parsed = queryString.parse(`q=${value}`);
    assert.equal(typeof parsed.q, 'string');
    assert.doesNotThrow(() => queryString.stringify(parsed));
  }
});

test('query-string preserves emoji and replaces lone Unicode surrogates', () => {
  assert.equal(queryString.stringify({ q: '🏐' }), 'q=%F0%9F%8F%90');
  assert.equal(queryString.stringify({ q: '\uD800' }), 'q=%EF%BF%BD');
  assert.equal(queryString.stringify({ q: '\uDC00' }), 'q=%EF%BF%BD');
});

test('the installed Expo Router serializes query parameters', () => {
  const path = getPathFromState({ routes: [{ name: 'Session', params: { id: '42', tab: 'games', label: 'Beach League' } }] },
    { screens: { Session: 'session/:id' } });
  const [pathname, query] = path.split('?');
  assert.equal(pathname, '/session/42');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(query)), { tab: 'games', label: 'Beach League' });
});

test('the installed Expo Router parses repeated and encoded query parameters', () => {
  const state = getStateFromPath('/session/42?tab=games&tag=one&tag=two&label=Beach%20League',
    { screens: { Session: 'session/:id' } });
  assert.equal(state.routes[0].name, 'Session');
  assert.deepEqual(state.routes[0].params, { id: '42', tab: 'games', tag: ['one', 'two'], label: 'Beach League' });
});
