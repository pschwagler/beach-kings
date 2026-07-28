import { presentRelationship } from '@/features/social';

describe('presentRelationship', () => {
  it('only offers Add Friend when there is no relationship', () => {
    expect(presentRelationship('none')).toMatchObject({
      canAdd: true,
      profileLabel: 'Add Friend',
    });

    for (const status of [
      'self',
      'friend',
      'pending_outgoing',
      'pending_incoming',
    ] as const) {
      expect(presentRelationship(status).canAdd).toBe(false);
    }
  });

  it('keeps incoming discovery rows compact while enabling profile response', () => {
    expect(presentRelationship('pending_incoming')).toEqual({
      discoveryLabel: 'Request received',
      profileLabel: null,
      canAdd: false,
      canRespond: true,
      canRemove: false,
      showMessage: true,
    });
  });

  it('uses distinct outgoing and confirmed labels', () => {
    expect(presentRelationship('pending_outgoing').discoveryLabel).toBe(
      'Request sent',
    );
    expect(presentRelationship('friend').profileLabel).toBe('Friends');
  });
});
