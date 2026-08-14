import fs from 'node:fs';
import path from 'node:path';
import {
  SEMANTIC_ROLES,
  tailwindClassName,
} from '@beach-kings/shared/tokens';

const MOBILE_ROOT = path.resolve(__dirname, '../..');
const SHIPPED_UI_ROOTS = [
  path.join(MOBILE_ROOT, 'app'),
  path.join(MOBILE_ROOT, 'src'),
];
const RAW_COLOR_EXCEPTIONS = new Set([
  path.join(MOBILE_ROOT, 'src/theme/avatarColors.ts'),
  path.join(MOBILE_ROOT, 'src/theme/thirdPartyColors.ts'),
]);

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('mobile UI architecture conventions', () => {
  it('keeps raw color literals in the documented identity-color modules', () => {
    const offenders = SHIPPED_UI_ROOTS.flatMap(sourceFiles)
      .filter((file) => !RAW_COLOR_EXCEPTIONS.has(file))
      .filter((file) => /#[0-9a-f]{3,8}\b/i.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(MOBILE_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('does not apply opacity modifiers to CSS-variable semantic colors', () => {
    const semanticClassNames = SEMANTIC_ROLES
      .map(tailwindClassName)
      .sort((left, right) => right.length - left.length)
      .join('|');
    const semanticOpacity = new RegExp(
      `\\b(?:text|bg|border)-(?:${semanticClassNames})/[0-9]+`,
    );
    const offenders = SHIPPED_UI_ROOTS.flatMap(sourceFiles)
      .filter((file) => semanticOpacity.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(MOBILE_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('requests only weights embedded for Barlow and Barlow Condensed', () => {
    const unsupportedWeight = /\bfont-(?:extrabold|black)\b|fontWeight\s*:\s*['"]?(?:800|900)\b/;
    const offenders = SHIPPED_UI_ROOTS.flatMap(sourceFiles)
      .filter((file) => unsupportedWeight.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(MOBILE_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('uses dedicated fill roles for saturated status backgrounds', () => {
    const textRoleUsedAsFill = /\bbg-(?:success|danger|warning|info|status-live)(?!-(?:fill|tint)\b)\b/;
    const offenders = SHIPPED_UI_ROOTS.flatMap(sourceFiles)
      .filter((file) => textRoleUsedAsFill.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(MOBILE_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('does not bypass semantic foreground roles with the legacy white utility', () => {
    const offenders = SHIPPED_UI_ROOTS.flatMap(sourceFiles)
      .filter((file) => /\btext-white\b/.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(MOBILE_ROOT, file));

    expect(offenders).toEqual([]);
  });
});
