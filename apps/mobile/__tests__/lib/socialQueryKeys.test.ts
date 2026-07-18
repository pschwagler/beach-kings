import { notificationQueryKeys, socialQueryKeys } from '@/lib/socialQueryKeys';
import { normalizePlayerRelationship } from '@/hooks/usePlayerRelationshipQuery';

describe('private social Query contracts', () => {
  it('scopes social and notification data by authenticated user', () => {
    expect(socialQueryKeys.friends(1)).not.toEqual(socialQueryKeys.friends(2));
    expect(notificationQueryKeys.feed(1)).not.toEqual(notificationQueryKeys.feed(2));
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
