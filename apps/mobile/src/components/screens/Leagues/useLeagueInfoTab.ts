/**
 * Data hook for the League Info tab.
 *
 * Makes five parallel real API calls:
 *   1. api.getLeague              — league metadata (description, access, level, location)
 *   2. api.getLeagueMembers       — member roster
 *   3. api.getLeagueSeasons       — season list
 *   4. api.getLeagueJoinRequests  — pending join requests (admin only; silently ignored on 403)
 *   5. api.getCurrentUserPlayer   — current player identity (for disabling self-remove)
 *
 * The five responses are composed into the LeagueInfoDetail shape consumed by
 * LeagueInfoTab.tsx.  Admin actions (approve/reject/role-change/remove/edit) call
 * real endpoints and invalidate the query on success.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { leagueKeys } from './leagueKeys';
import type {
  JoinRequest,
  LeagueInfoDetail,
  LeagueMemberRow,
  LeagueSeason,
  SkillLevel,
} from '@beach-kings/shared';

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
  /** Current authenticated player ID — used to disable self-remove in the UI. */
  readonly currentPlayerId: number | null;
  readonly onApproveRequest: (requestId: number) => Promise<void>;
  readonly onDenyRequest: (requestId: number) => Promise<void>;
  readonly onLeaveLeague: () => Promise<void>;
  /** Admin: change a member's role (auto-saves). */
  readonly onChangeRole: (memberId: number, role: 'admin' | 'member') => Promise<void>;
  /** Admin: remove a member from the league. */
  readonly onRemovePlayer: (memberId: number) => Promise<void>;
  /** Admin: update the league description (auto-saves). */
  readonly onUpdateDescription: (description: string) => Promise<void>;
  /** Admin: update access type — 'open' | 'invite_only' (auto-saves). */
  readonly onUpdateAccess: (accessType: 'open' | 'invite_only') => Promise<void>;
  /** Admin: update skill level label (auto-saves). */
  readonly onUpdateLevel: (level: string | null) => Promise<void>;
  /** Admin: add a home court (auto-saves). */
  readonly onAddCourt: (courtId: number) => Promise<void>;
  /** Admin: remove a home court (auto-saves). */
  readonly onRemoveCourt: (courtId: number) => Promise<void>;
}

/**
 * Returns all data and action handlers for the League Info tab.
 */
export function useLeagueInfoTab(
  leagueId: number | string,
): UseLeagueInfoTabResult {
  const numericId = Number(leagueId);
  const queryClient = useQueryClient();

  const infoQuery = useQuery<LeagueInfoDetail>({
    queryKey: leagueKeys.info(leagueId),
    queryFn: async (): Promise<LeagueInfoDetail> => {
      const [league, membersRaw, seasonsRaw, joinRequestsResult] =
        await Promise.all([
          api.getLeague(numericId),
          api.getLeagueMembers(numericId),
          api.getLeagueSeasons(numericId),
          api.getLeagueJoinRequests(numericId).catch(() => ({ pending: [], rejected: [] })),
        ]);

      const members: LeagueMemberRow[] = (Array.isArray(membersRaw) ? membersRaw : []).map(
        (m): LeagueMemberRow => ({
          id: m.id,
          player_id: m.player_id,
          display_name: m.player_name ?? `Player ${m.player_id}`,
          initials: toInitials(m.player_name),
          // Backend `role` can also be "placeholder" (guest/unclaimed players);
          // normalize anything that isn't an admin to "member" so the role badge
          // renders consistently instead of silently vanishing for guests.
          role: m.role === 'admin' ? 'admin' : 'member',
          joined_at: m.joined_at ?? m.created_at ?? '',
        }),
      );

      const seasons: LeagueSeason[] = (Array.isArray(seasonsRaw) ? seasonsRaw : []).map(
        (s): LeagueSeason => {
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
        access_type: league.access_type,
        level: league.level ?? null,
        location_id: league.location_id ?? null,
        location_name: league.location_name ?? null,
        home_courts: league.home_courts ?? [],
        members,
        seasons,
        join_requests: joinRequests,
      };
    },
  });

  // Fetch current player id separately so auth failures don't break the main query.
  const playerQuery = useQuery<{ id: number } | null>({
    queryKey: ['currentPlayer'],
    queryFn: async () => {
      try {
        const player = await api.getCurrentUserPlayer();
        return player ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
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

  const onChangeRole = useCallback(
    async (memberId: number, role: 'admin' | 'member'): Promise<void> => {
      await api.updateLeagueMember(numericId, memberId, role);
      await invalidateInfo();
    },
    [numericId, invalidateInfo],
  );

  const onRemovePlayer = useCallback(
    async (memberId: number): Promise<void> => {
      await api.removeLeagueMember(numericId, memberId);
      await invalidateInfo();
    },
    [numericId, invalidateInfo],
  );

  const onUpdateDescription = useCallback(
    async (description: string): Promise<void> => {
      await api.updateLeague(numericId, { description });
      await invalidateInfo();
    },
    [numericId, invalidateInfo],
  );

  const onUpdateAccess = useCallback(
    async (accessType: 'open' | 'invite_only'): Promise<void> => {
      await api.updateLeague(numericId, { is_open: accessType === 'open' });
      await invalidateInfo();
    },
    [numericId, invalidateInfo],
  );

  const onUpdateLevel = useCallback(
    async (level: string | null): Promise<void> => {
      await api.updateLeague(numericId, { level: (level ?? undefined) as SkillLevel | undefined });
      await invalidateInfo();
    },
    [numericId, invalidateInfo],
  );

  const onAddCourt = useCallback(
    async (courtId: number): Promise<void> => {
      await api.addLeagueHomeCourt(numericId, courtId);
      await invalidateInfo();
    },
    [numericId, invalidateInfo],
  );

  const onRemoveCourt = useCallback(
    async (courtId: number): Promise<void> => {
      await api.removeLeagueHomeCourt(numericId, courtId);
      await invalidateInfo();
    },
    [numericId, invalidateInfo],
  );

  return {
    info: infoQuery.data ?? null,
    isLoading: infoQuery.isLoading,
    isError: infoQuery.isError,
    currentPlayerId: playerQuery.data?.id ?? null,
    onApproveRequest,
    onDenyRequest,
    onLeaveLeague,
    onChangeRole,
    onRemovePlayer,
    onUpdateDescription,
    onUpdateAccess,
    onUpdateLevel,
    onAddCourt,
    onRemoveCourt,
  };
}
