#!/usr/bin/env node

/**
 * Verify that an existing Expo production export does not contain development
 * credential-import behavior or copy. This command deliberately does not run
 * an export itself; CI should invoke it after `expo export`.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEVELOPMENT_AUTH_MARKERS = [
  'devLoginWithTokens',
  'Development token login is unavailable',
  'Both development credentials are required',
  'dev-login-panel',
  'dev-access-token',
  'dev-refresh-token',
  'dev-import-tokens',
  'Import Tokens',
  'Quick Login (',
  'scripts/dev_login.py',
  'Development access token',
  'Development refresh token',
  'Credential Import Failed',
  'Fields are cleared after secure import; tokens are never logged.',
  'The development credential pair could not be verified.',
];

function listFiles(rootDirectory) {
  const files = [];
  const pending = [rootDirectory];

  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  }

  return files;
}

function assertExportArtifacts(exportDirectory, files, platforms) {
  const relativeFiles = files.map((file) =>
    path.relative(exportDirectory, file).split(path.sep).join('/'),
  );
  const missing = [];

  if (!relativeFiles.includes('metadata.json')) missing.push('metadata.json');
  for (const platform of platforms) {
    const prefix = `_expo/static/js/${platform}/`;
    if (!relativeFiles.some((file) => file.startsWith(prefix) && file.endsWith('.hbc'))) {
      missing.push(`${prefix}*.hbc`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Production export is incomplete; missing ${missing.join(', ')} in ${exportDirectory}`,
    );
  }
}

function findDevelopmentAuthMarkers(exportDirectory, files) {
  const encodedMarkers = DEVELOPMENT_AUTH_MARKERS.map((marker) => ({
    marker,
    bytes: Buffer.from(marker, 'utf8'),
  }));
  const findings = [];

  for (const file of files) {
    const contents = fs.readFileSync(file);
    for (const { marker, bytes } of encodedMarkers) {
      if (contents.includes(bytes)) {
        findings.push({
          file: path.relative(exportDirectory, file).split(path.sep).join('/'),
          marker,
        });
      }
    }
  }

  return findings;
}

function verifyProductionExport(exportDirectory, platforms = ['ios', 'android']) {
  const resolvedDirectory = path.resolve(exportDirectory);
  if (!fs.existsSync(resolvedDirectory)) {
    throw new Error(
      `Production export directory does not exist: ${resolvedDirectory}. Run expo export first.`,
    );
  }
  if (!fs.statSync(resolvedDirectory).isDirectory()) {
    throw new Error(`Production export path is not a directory: ${resolvedDirectory}`);
  }

  const files = listFiles(resolvedDirectory);
  assertExportArtifacts(resolvedDirectory, files, platforms);
  const findings = findDevelopmentAuthMarkers(resolvedDirectory, files);

  if (findings.length > 0) {
    const details = findings
      .map(({ file, marker }) => `  - ${file}: ${JSON.stringify(marker)}`)
      .join('\n');
    throw new Error(
      `Development authentication markers found in production export:\n${details}`,
    );
  }

  return { directory: resolvedDirectory, scannedFileCount: files.length };
}

if (require.main === module) {
  const exportDirectory = process.argv[2] ?? path.resolve(__dirname, '../dist');
  try {
    const result = verifyProductionExport(exportDirectory);
    console.log(
      `Production development-auth verification passed (${result.scannedFileCount} files): ${result.directory}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  DEVELOPMENT_AUTH_MARKERS,
  verifyProductionExport,
};
