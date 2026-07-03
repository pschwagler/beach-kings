/**
 * Data hook for the League Detail orchestrator screen.
 *
 * Fetches the top-level league detail (name, role, stats summary) and
 * manages the active tab state for the segment bar.
 *
 * Non-members (visitors — `user_role == null`) get a lean view: only the
 * Standings and Info tabs are visible, and an optional Join CTA lets them
 * request to join an open league. The active tab is clamped to the visible
 * set so a visitor never lands on a hidden tab.
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type { LeagueDetail } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { leagueKeys } from './leagueKeys';
import { routes } from '@/lib/navigation';

export type LeagueDetailTab = 'games' | 'standings' | 'chat' | 'signups' | 'info';

/** Tabs a non-member visitor may see. */
const VISITOR_TABS: readonly LeagueDetailTab[] = ['standings', 'info'];
/** Tabs a member/admin may see (the full set). */
const MEMBER_TABS: readonly LeagueDetailTab[] = [
  'games',
  'standings',
  'chat',
  'signups',
  'info',
];

export interface UseLeagueDetailScreenResult {
  readonly leagueId: number | string;
  readonly detail: LeagueDetail | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly activeTab: LeagueDetailTab;
  readonly onSetTab: (tab: LeagueDetailTab) => void;
  readonly onPressPlayer: (playerId: number | string) => void;
  /** True when the caller is not a member of this league. */
  readonly isVisitor: boolean;
  /** The tab keys the caller is allowed to see, in display order. */
  readonly visibleTabs: readonly LeagueDetailTab[];
  /** True when a visitor can request to join (open league, no pending request). */
  readonly canRequestToJoin: boolean;
  /** True when a visitor already has a pending join request. */
  readonly hasPendingRequest: boolean;
  /** True when a visitor is looking at an invite-only league (no self-serve join). */
  readonly isInviteOnly: boolean;
  /** Send a request-to-join for an open league. */
  readonly onRequestToJoin: () => Promise<void>;
  /** True while a request-to-join is in flight. */
  readonly isRequestingToJoin: boolean;
}

/**
 * Returns data and handlers for the League Detail screen orchestrator.
 */
export function useLeagueDetailScreen(
  leagueId: number | string,
): UseLeagueDetailScreenResult {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [rawActiveTab, setActiveTab] = useState<LeagueDetailTab>('games');
  const [isRequestingToJoin, setIsRequestingToJoin] = useState(false);

  const detailQuery = useQuery({
    queryKey: leagueKeys.detail(leagueId),
    queryFn: () => api.getLeague(Number(leagueId)),
  });

  const detail = detailQuery.data ?? null;

  // A visitor is anyone with no membership role. While the detail is still
  // loading we treat the caller as a member so the full tab set is assumed
  // (the screen shows a spinner until the role is known either way).
  const isVisitor = detail != null && detail.user_role == null;
  const visibleTabs = isVisitor ? VISITOR_TABS : MEMBER_TABS;

  // Clamp the active tab to the visible set so a visitor never lands on a
  // hidden tab (e.g. the default 'games' tab they cannot see).
  const activeTab = visibleTabs.includes(rawActiveTab)
    ? rawActiveTab
    : visibleTabs[0];

  const onSetTab = useCallback((tab: LeagueDetailTab) => {
    setActiveTab(tab);
  }, []);

  const onPressPlayer = useCallback(
    (playerId: number | string) => {
      router.push(routes.player(playerId) as never);
    },
    [router],
  );

  const hasPendingRequest = detail?.has_pending_request ?? false;
  const isInviteOnly = isVisitor && detail?.access_type === 'invite_only';
  const canRequestToJoin =
    isVisitor && detail?.access_type === 'open' && !hasPendingRequest;

  const onRequestToJoin = useCallback(async (): Promise<void> => {
    setIsRequestingToJoin(true);
    // Optimistically reflect the pending request so the CTA flips immediately.
    queryClient.setQueryData<LeagueDetail>(leagueKeys.detail(leagueId), (old) =>
      old ? { ...old, has_pending_request: true } : old,
    );
    try {
      await api.requestToJoinLeague(Number(leagueId));
    } catch (err) {
      // Roll back the optimistic flag on failure.
      queryClient.setQueryData<LeagueDetail>(leagueKeys.detail(leagueId), (old) =>
        old ? { ...old, has_pending_request: false } : old,
      );
      throw err;
    } finally {
      setIsRequestingToJoin(false);
      void queryClient.invalidateQueries({
        queryKey: leagueKeys.detail(leagueId),
      });
    }
  }, [queryClient, leagueId]);

  return {
    leagueId,
    detail,
    isLoading: detailQuery.isLoading,
    isError: detailQuery.isError,
    activeTab,
    onSetTab,
    onPressPlayer,
    isVisitor,
    visibleTabs,
    canRequestToJoin,
    hasPendingRequest,
    isInviteOnly,
    onRequestToJoin,
    isRequestingToJoin,
  };
}
