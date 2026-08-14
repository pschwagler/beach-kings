import { moderationKeys } from '@/features/moderation';

describe('moderation query keys', () => {
  it('keeps blocks and reports isolated by authenticated account', () => {
    expect(moderationKeys.blocks(7)).toEqual(['private', 7, 'moderation', 'blocks']);
    expect(moderationKeys.reports(8)).toEqual(['private', 8, 'moderation', 'reports']);
    expect(moderationKeys.blocks(7)).not.toEqual(moderationKeys.blocks(8));
    expect(moderationKeys.capabilities(7, [9, 3, 9])).toEqual([
      'private', 7, 'moderation', 'capabilities', [3, 9],
    ]);
    expect(moderationKeys.capabilities(7, [3])).not.toEqual(
      moderationKeys.capabilities(8, [3]),
    );
  });
});
