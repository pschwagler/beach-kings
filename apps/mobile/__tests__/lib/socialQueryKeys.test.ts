import { notificationKeys } from '@/features/notifications/keys';
import { socialKeys } from '@/features/social/keys';
import { normalizePlayerRelationship } from '@/features/social/usePlayerRelationshipQuery';

describe('private social Query contracts', () => {
  it('scopes social and notification data by authenticated user', () => {
    expect(socialKeys.friends(1)).not.toEqual(socialKeys.friends(2));
    expect(notificationKeys.feed(1)).not.toEqual(notificationKeys.feed(2));
    expect(socialKeys.friends(1).slice(0, 2)).toEqual(['private', 1]);
    expect(notificationKeys.feed(1).slice(0, 2)).toEqual(['private', 1]);
  });

  it('prefers canonical relationship metadata with request id', () => {
    expect(normalizePlayerRelationship({
      statuses: { '44': 'pending_outgoing' },
      relationships: {
        '44': { status: 'pending_incoming', request_id: 81 },
      },
    }, 44)).toEqual({ status: 'pending_incoming', request_id: 81 });
  });

  it('supports the legacy statuses map during backend rollout', () => {
    expect(normalizePlayerRelationship({
      statuses: { '44': 'friend' },
    }, 44)).toEqual({ status: 'friend', request_id: null });
  });
});
