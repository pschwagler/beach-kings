import type { LeagueInviteItem } from '@beach-kings/shared';

/** Keep received-invite surfaces actionable even if an older cache has stale rows. */
export function getPendingLeagueInvites(
  invites: readonly LeagueInviteItem[] | undefined,
): LeagueInviteItem[] {
  return (invites ?? []).filter((invite) => invite.status === 'pending');
}

/** The received endpoint is newest-first; the ID tie-break keeps rollback stable. */
export function orderReceivedLeagueInvites(
  invites: readonly LeagueInviteItem[],
): LeagueInviteItem[] {
  return [...invites].sort((left, right) => {
    const leftTime = Date.parse(left.invited_at);
    const rightTime = Date.parse(right.invited_at);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      const newestFirst = rightTime - leftTime;
      if (newestFirst !== 0) return newestFirst;
    } else if (Number.isFinite(leftTime)) {
      return -1;
    } else if (Number.isFinite(rightTime)) {
      return 1;
    }
    return right.id - left.id;
  });
}
