/**
 * Data hook for the League Detail orchestrator screen.
 *
 * Fetches the top-level league detail (name, role, stats summary) and
 * manages the active tab state for the segment bar.
 *
 * Non-members (visitors — `user_role == null`) get a lean view: only the
 * Standings and Info tabs are visible (Standings is further hidden for
 * visitors of a *private* league, since the backend 403s that request), and
 * a Join CTA lets them either join an open league directly or request to
 * join an invite-only one. The active tab is clamped to the visible set so
 * a visitor never lands on a hidden tab.
 */

import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { LeagueDetail } from "@beach-kings/shared";
import { api } from "@/lib/api";
import { leagueKeys } from "./leagueKeys";
import { routes, type LeagueTab } from "@/lib/navigation";
import { useAuth } from "@/contexts/AuthContext";

export type LeagueDetailTab = LeagueTab;

const LEAGUE_DETAIL_TABS: readonly LeagueDetailTab[] = [
  "games",
  "standings",
  "chat",
  "signups",
  "info",
];

export function normalizeLeagueDetailTab(
  raw: string | string[] | undefined,
): LeagueDetailTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return LEAGUE_DETAIL_TABS.includes(value as LeagueDetailTab)
    ? value as LeagueDetailTab
    : "games";
}

/** Tabs a non-member visitor may see. */
const VISITOR_TABS: readonly LeagueDetailTab[] = ["standings", "info"];
/**
 * Tabs a member/admin may see.
 *
 * 'signups' is intentionally omitted for now: the feature depends on a season +
 * weekly schedule, which can only be created by an admin on web (there is no
 * mobile create-season/schedule path), so the tab only ever renders an empty
 * "No Upcoming Events" state on mobile. The tab component, route, and type are
 * left intact — re-enable by adding 'signups' back here.
 */
const MEMBER_TABS: readonly LeagueDetailTab[] = [
  "games",
  "standings",
  "chat",
  "info",
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
  /** True when a visitor can directly join (open league). */
  readonly canJoinDirectly: boolean;
  /** True when a visitor can request to join (invite-only league, no pending request). */
  readonly canRequestToJoin: boolean;
  /** True when a visitor already has a pending join request. */
  readonly hasPendingRequest: boolean;
  /** True when a visitor is looking at an invite-only league. */
  readonly isInviteOnly: boolean;
  /** Directly join an open league. */
  readonly onJoinLeague: () => Promise<void>;
  /** True while a direct join is in flight. */
  readonly isJoiningLeague: boolean;
  /** Send a request-to-join for an invite-only league. */
  readonly onRequestToJoin: () => Promise<void>;
  /** True while a request-to-join is in flight. */
  readonly isRequestingToJoin: boolean;
}

/**
 * Returns data and handlers for the League Detail screen orchestrator.
 */
export function useLeagueDetailScreen(
  leagueId: number | string,
  initialTab: LeagueDetailTab = "games",
): UseLeagueDetailScreenResult {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [rawActiveTab, setActiveTab] = useState<LeagueDetailTab>(initialTab);
  const [isRequestingToJoin, setIsRequestingToJoin] = useState(false);
  const [isJoiningLeague, setIsJoiningLeague] = useState(false);

  const detailQuery = useQuery({
    queryKey: leagueKeys.detail(userId, leagueId),
    queryFn: () => api.getLeague(Number(leagueId)),
    enabled: userId > 0,
  });

  const detail = detailQuery.data ?? null;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, leagueId]);

  // A visitor is anyone with no membership role. While the detail is still
  // loading we treat the caller as a member so the full tab set is assumed
  // (the screen shows a spinner until the role is known either way).
  const isVisitor = detail != null && detail.user_role == null;
  // A visitor of a PRIVATE league can't see Standings — the backend 403s
  // that request for non-members. Public leagues intentionally allow
  // visitors to browse Standings, so only strip the tab when is_public is
  // known to be false (never for the still-loading/undefined case).
  const visitorTabs =
    isVisitor && detail?.is_public === false
      ? VISITOR_TABS.filter((tab) => tab !== "standings")
      : VISITOR_TABS;
  const visibleTabs = isVisitor ? visitorTabs : MEMBER_TABS;

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
  const isInviteOnly = isVisitor && detail?.access_type === "invite_only";
  // Open leagues are joined directly; invite-only leagues require a request
  // (see backend: POST /join 400s invite-only leagues, POST /request-join
  // 400s open leagues).
  const canJoinDirectly = isVisitor && detail?.access_type === "open";
  const canRequestToJoin = isInviteOnly && !hasPendingRequest;

  const onRequestToJoin = useCallback(async (): Promise<void> => {
    setIsRequestingToJoin(true);
    // Optimistically reflect the pending request so the CTA flips immediately.
    queryClient.setQueryData<LeagueDetail>(
      leagueKeys.detail(userId, leagueId),
      (old) => (old ? { ...old, has_pending_request: true } : old),
    );
    try {
      await api.requestToJoinLeague(Number(leagueId));
      // The optimistic flag already reflects this screen's server state — no
      // detail refetch needed on the happy path. The Find Leagues list still
      // caches this league's `user_status` ('none' → 'requested') under its
      // own key, so invalidate it or the search results stay stale.
      void queryClient.invalidateQueries({
        queryKey: leagueKeys.findRoot(userId),
      });
    } catch (err) {
      // Roll back the optimistic flag on failure, then reconcile with the
      // server in case the request actually landed despite the client error.
      queryClient.setQueryData<LeagueDetail>(
        leagueKeys.detail(userId, leagueId),
        (old) => (old ? { ...old, has_pending_request: false } : old),
      );
      void queryClient.invalidateQueries({
        queryKey: leagueKeys.detail(userId, leagueId),
      });
      throw err;
    } finally {
      setIsRequestingToJoin(false);
    }
  }, [queryClient, leagueId, userId]);

  const onJoinLeague = useCallback(async (): Promise<void> => {
    setIsJoiningLeague(true);
    try {
      await api.joinLeague(Number(leagueId));
      // A direct join makes the caller a member (user_role, visible tabs,
      // and stats all change) — refetch rather than guess at every field.
      // The list-level caches also encode this league's membership/status
      // under separate key namespaces, so invalidate them too or the
      // "My Leagues" tab and Find Leagues results stay stale (staleTime 30s,
      // no focus-refetch) after a successful join.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: leagueKeys.detail(userId, leagueId),
        }),
        queryClient.invalidateQueries({
          queryKey: leagueKeys.userLeagues(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: leagueKeys.findRoot(userId),
        }),
      ]);
    } finally {
      setIsJoiningLeague(false);
    }
  }, [queryClient, leagueId, userId]);

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
    canJoinDirectly,
    canRequestToJoin,
    hasPendingRequest,
    isInviteOnly,
    onJoinLeague,
    isJoiningLeague,
    onRequestToJoin,
    isRequestingToJoin,
  };
}
