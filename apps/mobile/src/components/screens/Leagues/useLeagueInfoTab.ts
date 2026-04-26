/**
 * Data hook for the League Info tab.
 *
 * Makes three parallel real API calls:
 *   1. api.getLeague          — league metadata (description, access, level, location)
 *   2. api.getLeagueMembers   — member roster
 *   3. api.getLeagueSeasons   — season list
 *   4. api.getLeagueJoinRequests — pending join requests (admin only; silently ignored on 403)
 *
 * The four responses are composed into the LeagueInfoDetail shape consumed by
 * LeagueInfoTab.tsx.  Admin actions (approve/reject) call real endpoints.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { leagueKeys } from './leagueKeys';
import type { JoinRequest, LeagueSeason } from '@beach-kings/shared';
import type { LeagueInfoDetail, LeagueMemberRow } from '@/lib/mockApi';

/** Derive two-letter initials from a player name ("Patrick Schwagler" → "PS"). */
function toInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export interface UseLeagueInfoTabResult {
  readonly info: LeagueInfoDetail | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onApproveRequest: (requestId: number) => Promise<void>;
  readonly onDenyRequest: (requestId: number) => Promise<void>;
  readonly onLeaveLeague: () => Promise<void>;
}

/**
 * Returns all data and handlers for the League Info tab.
 */
export function useLeagueInfoTab(
  leagueId: number | string,
): UseLeagueInfoTabResult {
  const numericId = Number(leagueId);
  const queryClient = useQueryClient();

  const infoQuery = useQuery<LeagueInfoDetail>({
    queryKey: leagueKeys.info(leagueId),
    queryFn: async (): Promise<LeagueInfoDetail> => {
      // Fetch league metadata, members, seasons, and join requests in parallel.
      // Join requests are admin-only; a 403 is treated as an empty list.
      const [league, membersRaw, seasonsRaw, joinRequestsResult] =
        await Promise.all([
          api.getLeague(numericId),
          api.getLeagueMembers(numericId),
          api.getLeagueSeasons(numericId),
          api.getLeagueJoinRequests(numericId).catch(() => ({ pending: [], rejected: [] })),
        ]);

      const members: LeagueMemberRow[] = (Array.isArray(membersRaw) ? membersRaw : []).map(
        (m): LeagueMemberRow => ({
          player_id: m.player_id,
          display_name: m.player_name ?? `Player ${m.player_id}`,
          initials: toInitials(m.player_name),
          role: (m.role as 'admin' | 'member' | 'visitor') ?? 'member',
          joined_at: m.joined_at ?? m.created_at ?? '',
        }),
      );

      const seasons: LeagueSeason[] = (Array.isArray(seasonsRaw) ? seasonsRaw : []).map(
        (s): LeagueSeason => {
          // The Season type only exposes start_date/end_date; some endpoints also
          // return session_count and game_count as extra fields. Use a typed cast
          // so TypeScript stays happy while we handle either shape.
          const raw = s as unknown as Record<string, unknown>;
          return {
            id: s.id,
            name: s.name ?? '',
            is_active: s.is_active ?? false,
            started_at: (s.start_date ?? '') as string,
            ended_at: (s.end_date ?? null) as string | null,
            session_count: (raw['session_count'] as number | undefined) ?? 0,
            game_count: (raw['game_count'] as number | undefined) ?? 0,
          };
        },
      );

      const joinRequests: JoinRequest[] = joinRequestsResult.pending.map(
        (r): JoinRequest => ({
          id: r.id,
          player_id: r.player_id,
          display_name: r.display_name,
          initials: toInitials(r.display_name),
          requested_at: r.requested_at,
          status: r.status,
          message: null,
        }),
      );

      return {
        id: league.id,
        description: league.description ?? null,
        access_type: league.is_open ? 'open' : 'invite_only',
        level: league.level ?? null,
        location_name: league.location_name ?? null,
        home_court_name:
          league.home_courts?.[0]?.name ?? null,
        members,
        seasons,
        join_requests: joinRequests,
      };
    },
  });

  const invalidateInfo = useCallback((): Promise<void> => {
    return queryClient.invalidateQueries({ queryKey: leagueKeys.info(leagueId) });
  }, [queryClient, leagueId]);

  const onApproveRequest = useCallback(
    async (requestId: number): Promise<void> => {
      await api.approveJoinRequest(numericId, requestId);
      await invalidateInfo();
    },
    [numericId, invalidateInfo],
  );

  const onDenyRequest = useCallback(
    async (requestId: number): Promise<void> => {
      await api.rejectJoinRequest(numericId, requestId);
      await invalidateInfo();
    },
    [numericId, invalidateInfo],
  );

  const onLeaveLeague = useCallback(async (): Promise<void> => {
    await api.leaveLeague(numericId);
    await invalidateInfo();
  }, [numericId, invalidateInfo]);

  return {
    info: infoQuery.data ?? null,
    isLoading: infoQuery.isLoading,
    isError: infoQuery.isError,
    onApproveRequest,
    onDenyRequest,
    onLeaveLeague,
  };
}
