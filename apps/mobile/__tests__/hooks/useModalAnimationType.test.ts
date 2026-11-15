import { getModalAnimationType } from '@/hooks/useModalAnimationType';

describe('getModalAnimationType', () => {
  it('keeps the standard slide transition when Reduce Motion is off', () => {
    expect(getModalAnimationType(false)).toBe('slide');
  });

  it('removes spatial motion when Reduce Motion is on', () => {
    expect(getModalAnimationType(true)).toBe('none');
  });
});
