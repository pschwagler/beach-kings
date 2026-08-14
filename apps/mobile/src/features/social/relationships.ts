import type { FriendshipStatus } from '@beach-kings/shared';

export interface RelationshipPresentation {
  readonly discoveryLabel: string | null;
  readonly profileLabel: string | null;
  readonly canAdd: boolean;
  readonly canRespond: boolean;
  readonly canRemove: boolean;
  readonly showMessage: boolean;
}

const PRESENTATION: Readonly<Record<FriendshipStatus, RelationshipPresentation>> = {
  self: {
    discoveryLabel: null,
    profileLabel: null,
    canAdd: false,
    canRespond: false,
    canRemove: false,
    showMessage: false,
  },
  none: {
    discoveryLabel: 'Add',
    profileLabel: 'Add Friend',
    canAdd: true,
    canRespond: false,
    canRemove: false,
    showMessage: true,
  },
  friend: {
    discoveryLabel: 'Friends',
    profileLabel: 'Friends',
    canAdd: false,
    canRespond: false,
    canRemove: true,
    showMessage: true,
  },
  pending_outgoing: {
    discoveryLabel: 'Request sent',
    profileLabel: 'Request sent',
    canAdd: false,
    canRespond: false,
    canRemove: false,
    showMessage: true,
  },
  pending_incoming: {
    discoveryLabel: 'Request received',
    profileLabel: null,
    canAdd: false,
    canRespond: true,
    canRemove: false,
    showMessage: true,
  },
};

/** Shared copy and capabilities for every relationship-backed social control. */
export function presentRelationship(
  status: FriendshipStatus,
): RelationshipPresentation {
  return PRESENTATION[status];
}
