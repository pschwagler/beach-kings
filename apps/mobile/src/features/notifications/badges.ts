export interface NavigationBadgeInputs {
  readonly allUnreadNotifications: number;
  readonly unreadDirectMessages: number;
  readonly incomingFriendRequests: number;
  readonly pendingLeagueInvitations: number;
}

/** Documents the mutually attributable count shown on each navigation surface. */
export function navigationBadgeCounts(input: NavigationBadgeInputs) {
  return {
    global: Math.max(0, input.allUnreadNotifications),
    social:
      Math.max(0, input.unreadDirectMessages) +
      Math.max(0, input.incomingFriendRequests),
    leagues: Math.max(0, input.pendingLeagueInvitations),
  } as const;
}

/** Query-backed badge scopes for the global, Social, and Leagues surfaces. */
export function useNavigationBadgeCounts() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  const enabled = isAuthenticated && userId > 0;
  const { unreadCount, dmUnreadCount } = useNotifications();
  const incomingRequests = useQuery(
    socialQueries.requests(userId, 'incoming', enabled),
  );
  const receivedInvites = useQuery(
    leagueQueries.receivedInvites(userId, enabled),
  );
  return navigationBadgeCounts({
    allUnreadNotifications: unreadCount,
    unreadDirectMessages: dmUnreadCount,
    incomingFriendRequests: incomingRequests.data?.length ?? 0,
    pendingLeagueInvitations:
      receivedInvites.data?.filter((invite) => invite.status === 'pending').length ?? 0,
  });
}
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { socialQueries } from '@/features/social';
import { leagueQueries } from '@/features/leagues';
import { useNotifications } from './useNotifications';
