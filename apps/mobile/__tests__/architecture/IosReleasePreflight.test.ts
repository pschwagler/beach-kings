import path from 'node:path';

const {
  assertSecureProductionOrigin,
  verifyReleaseConfiguration,
} = require('../../scripts/release-preflight') as {
  assertSecureProductionOrigin: (value: string | undefined) => string;
  verifyReleaseConfiguration: (options: {
    mobileRoot: string;
    apiUrl: string | undefined;
    exportDirectory: string;
  }) => {
    apiOrigin: string;
    bundleIdentifier: string;
    deviceFamily: string;
    version: string;
  };
};

const mobileRoot = path.resolve(__dirname, '../..');

describe('iOS release preflight', () => {
  it('accepts the checked-in native release configuration', () => {
    expect(
      verifyReleaseConfiguration({
        mobileRoot,
        apiUrl: 'https://beachleaguevb.com',
        exportDirectory: path.join(mobileRoot, 'dist'),
      }),
    ).toEqual(
      expect.objectContaining({
        apiOrigin: 'https://beachleaguevb.com',
        bundleIdentifier: 'com.beachleague.app',
        deviceFamily: 'iPhone',
        version: '1.0.0 (1)',
      }),
    );
  });

  it.each([undefined, '', 'not-a-url', 'http://beachleaguevb.com']) (
    'rejects a missing, malformed, or insecure release origin: %s',
    (value) => expect(() => assertSecureProductionOrigin(value)).toThrow(),
  );

  it.each([
    'http://localhost:8000',
    'https://localhost:8000',
    'https://127.0.0.1:8000',
  ])('rejects a localhost release origin: %s', (value) => {
    expect(() => assertSecureProductionOrigin(value)).toThrow(/localhost/);
  });
});

