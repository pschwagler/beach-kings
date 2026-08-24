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

  it('isolates every normalized discovery location input', () => {
    const exact = socialKeys.discovery(1, { location_id: 'socal_sd' });
    const nearby25 = socialKeys.discovery(1, {
      origin_location_id: 'socal_sd',
      radius_miles: 25,
    });
    const nearby50 = socialKeys.discovery(1, {
      origin_location_id: 'socal_sd',
      radius_miles: 50,
    });

    expect(exact.slice(0, 2)).toEqual(['private', 1]);
    expect(exact).not.toEqual(socialKeys.discovery(2, { location_id: 'socal_sd' }));
    expect(exact).not.toEqual(nearby25);
    expect(nearby25).not.toEqual(nearby50);
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
