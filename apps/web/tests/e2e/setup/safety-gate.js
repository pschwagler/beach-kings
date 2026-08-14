#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

export const LOCAL_E2E = Object.freeze({
  webOrigin: 'http://localhost:3002',
  apiOrigin: 'http://localhost:8001',
  databaseUrl: 'postgresql://beachkings:beachkings@localhost:5433/beachkings_test',
  databaseName: 'beachkings_test',
  databasePort: 5433,
  redisPort: 6380,
  backendContainer: 'beach-kings-backend-test',
  postgresContainer: 'beach-kings-postgres-test',
  redisContainer: 'beach-kings-redis-test',
});

function normalizedLocalOrigin(value, label) {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`SAFETY: ${label} must use a loopback host, received ${url.hostname}`);
  }
  return `${url.protocol}//localhost:${url.port}`;
}

function inspectContainer(name) {
  const raw = execFileSync('docker', ['inspect', name], { encoding: 'utf8' });
  const [container] = JSON.parse(raw);
  if (!container?.State?.Running) {
    throw new Error(`SAFETY: required container ${name} is not running`);
  }
  return container;
}

function assertNoConcurrentBackendTests() {
  const processes = execFileSync(
    'docker',
    ['top', LOCAL_E2E.backendContainer, '-eo', 'pid,comm,args'],
    { encoding: 'utf8' },
  );
  if (/\bpytest\b/.test(processes)) {
    throw new Error(
      'SAFETY: a backend pytest process is using the shared test database; stop it before E2E',
    );
  }
}

function assertPublishedPort(container, containerPort, expectedHostPort) {
  const bindings = container.NetworkSettings?.Ports?.[`${containerPort}/tcp`] || [];
  if (!bindings.some(({ HostPort }) => Number(HostPort) === expectedHostPort)) {
    throw new Error(
      `SAFETY: ${container.Name} does not publish ${containerPort} on local port ${expectedHostPort}`,
    );
  }
}

function envMap(container) {
  return new Map((container.Config?.Env || []).map((entry) => {
    const separator = entry.indexOf('=');
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}

export async function verifyLocalE2ESafety() {
  const webOrigin = normalizedLocalOrigin(
    process.env.PLAYWRIGHT_TEST_BASE_URL || LOCAL_E2E.webOrigin,
    'PLAYWRIGHT_TEST_BASE_URL',
  );
  const apiOrigin = normalizedLocalOrigin(
    process.env.TEST_API_URL || LOCAL_E2E.apiOrigin,
    'TEST_API_URL',
  );
  if (webOrigin !== LOCAL_E2E.webOrigin || apiOrigin !== LOCAL_E2E.apiOrigin) {
    throw new Error(
      `SAFETY: E2E endpoints must be ${LOCAL_E2E.webOrigin} and ${LOCAL_E2E.apiOrigin}`,
    );
  }

  const databaseUrl = process.env.TEST_DATABASE_URL || LOCAL_E2E.databaseUrl;
  const parsedDatabase = new URL(databaseUrl);
  const databaseName = parsedDatabase.pathname.replace(/^\//, '');
  if (
    !['localhost', '127.0.0.1', '::1'].includes(parsedDatabase.hostname) ||
    Number(parsedDatabase.port) !== LOCAL_E2E.databasePort ||
    databaseName !== LOCAL_E2E.databaseName
  ) {
    throw new Error(
      `SAFETY: database must be ${LOCAL_E2E.databaseName} on loopback:${LOCAL_E2E.databasePort}`,
    );
  }

  const backend = inspectContainer(LOCAL_E2E.backendContainer);
  const postgres = inspectContainer(LOCAL_E2E.postgresContainer);
  const redis = inspectContainer(LOCAL_E2E.redisContainer);
  assertPublishedPort(backend, 8000, 8001);
  assertPublishedPort(postgres, 5432, LOCAL_E2E.databasePort);
  assertPublishedPort(redis, 6379, LOCAL_E2E.redisPort);
  assertNoConcurrentBackendTests();

  const backendEnv = envMap(backend);
  const postgresEnv = envMap(postgres);
  if (backendEnv.get('ENV') !== 'test') {
    throw new Error('SAFETY: backend container is not running with ENV=test');
  }
  if (
    backendEnv.get('POSTGRES_DB') !== LOCAL_E2E.databaseName ||
    postgresEnv.get('POSTGRES_DB') !== LOCAL_E2E.databaseName
  ) {
    throw new Error('SAFETY: backend/PostgreSQL database names do not match beachkings_test');
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const result = await client.query('SELECT current_database() AS name, inet_server_port() AS port');
    if (result.rows[0]?.name !== LOCAL_E2E.databaseName || Number(result.rows[0]?.port) !== 5432) {
      throw new Error('SAFETY: connected PostgreSQL identity did not match the test container');
    }
  } finally {
    await client.end().catch(() => {});
  }

  const health = await fetch(`${LOCAL_E2E.apiOrigin}/api/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!health.ok || (await health.json()).status !== 'healthy') {
    throw new Error('SAFETY: local test backend health check failed');
  }

  return {
    web: LOCAL_E2E.webOrigin,
    api: LOCAL_E2E.apiOrigin,
    database: `${LOCAL_E2E.databaseName}@localhost:${LOCAL_E2E.databasePort}`,
    redis: `localhost:${LOCAL_E2E.redisPort}`,
    environment: 'test',
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyLocalE2ESafety()
    .then((summary) => console.log(`Local E2E safety gate passed: ${JSON.stringify(summary)}`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
