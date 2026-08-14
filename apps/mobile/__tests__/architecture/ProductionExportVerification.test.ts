import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  DEVELOPMENT_AUTH_MARKERS,
  verifyProductionExport,
} = require('../../scripts/verify-production-no-dev-auth') as {
  DEVELOPMENT_AUTH_MARKERS: readonly string[];
  verifyProductionExport: (directory: string) => {
    directory: string;
    scannedFileCount: number;
  };
};

function makeExport(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-production-export-'));
  for (const platform of ['ios', 'android']) {
    const bundleDirectory = path.join(root, '_expo', 'static', 'js', platform);
    fs.mkdirSync(bundleDirectory, { recursive: true });
    fs.writeFileSync(path.join(bundleDirectory, `entry-${platform}.hbc`), 'clean bundle');
  }
  fs.writeFileSync(path.join(root, 'metadata.json'), '{}');
  return root;
}

describe('production export development-auth verification', () => {
  const temporaryExports = new Set<string>();

  afterEach(() => {
    for (const directory of temporaryExports) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    temporaryExports.clear();
  });

  it('accepts complete clean iOS and Android exports', () => {
    const root = makeExport();
    temporaryExports.add(root);

    expect(verifyProductionExport(root)).toEqual({
      directory: root,
      scannedFileCount: 3,
    });
  });

  it('reports the artifact and marker when development auth leaks', () => {
    const root = makeExport();
    temporaryExports.add(root);
    const iosBundle = path.join(
      root,
      '_expo',
      'static',
      'js',
      'ios',
      'entry-ios.hbc',
    );
    fs.appendFileSync(iosBundle, DEVELOPMENT_AUTH_MARKERS[0]);

    expect(() => verifyProductionExport(root)).toThrow(
      /entry-ios\.hbc: "devLoginWithTokens"/,
    );
  });

  it('scans exported assets as well as Hermes bytecode', () => {
    const root = makeExport();
    temporaryExports.add(root);
    const assetDirectory = path.join(root, 'assets');
    fs.mkdirSync(assetDirectory);
    fs.writeFileSync(
      path.join(assetDirectory, 'generated-asset'),
      DEVELOPMENT_AUTH_MARKERS[4],
    );

    expect(() => verifyProductionExport(root)).toThrow(
      /assets\/generated-asset: "dev-access-token"/,
    );
  });

  it('fails clearly when a platform bundle is missing', () => {
    const root = makeExport();
    temporaryExports.add(root);
    fs.rmSync(path.join(root, '_expo', 'static', 'js', 'android'), {
      recursive: true,
      force: true,
    });

    expect(() => verifyProductionExport(root)).toThrow(
      /missing _expo\/static\/js\/android\/\*\.hbc/,
    );
  });
});
