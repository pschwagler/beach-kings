import fs from 'node:fs';
import path from 'node:path';

describe('AuthContext feature boundaries', () => {
  it('imports player queries from the leaf module instead of the cyclic barrel', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/contexts/AuthContext.tsx'),
      'utf8',
    );

    expect(source).toContain("from '@/features/player/queries'");
    expect(source).not.toMatch(/from ['"]@\/features\/player['"]/);
  });
});
