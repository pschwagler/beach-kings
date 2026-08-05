import fs from 'node:fs';
import path from 'node:path';

type ImportPath = { node: { source: { value: string } } };

const redirectPlugin = require('../../babel-plugins/redirect-production-development-modules') as () => {
  visitor: { ImportDeclaration: (path: ImportPath) => void };
};

const mobileRoot = path.resolve(__dirname, '../..');

describe('production development-module boundary', () => {
  it.each([
    [
      '@/components/dev/DevLoginPanel',
      '@/components/dev/DevLoginPanel.production',
    ],
    [
      '@/components/dev/authExtension',
      '@/components/dev/authExtension.production',
    ],
  ])('redirects %s before dependency collection', (source, expected) => {
    const importPath: ImportPath = { node: { source: { value: source } } };
    redirectPlugin().visitor.ImportDeclaration(importPath);
    expect(importPath.node.source.value).toBe(expected);
  });

  it('keeps credential implementation markers out of production stubs', () => {
    const productionSources = [
      'src/components/dev/DevLoginPanel.production.tsx',
      'src/components/dev/authExtension.production.ts',
    ].map((relativePath) =>
      fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8'),
    );

    for (const source of productionSources) {
      expect(source).not.toMatch(
        /devLoginWithTokens|accessToken|refreshToken|Import Tokens|secure import/,
      );
    }
  });

  it('keeps the production-reachable auth and login modules generic', () => {
    const productionReachableSources = [
      'src/contexts/AuthContext.tsx',
      'app/(auth)/login.tsx',
    ].map((relativePath) =>
      fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8'),
    );

    for (const source of productionReachableSources) {
      expect(source).not.toMatch(
        /devLoginWithTokens|Development token login is unavailable|Import Tokens/,
      );
    }
  });
});
