import type { LeagueSessionSummary } from '@beach-kings/shared';

/** Choose the most recently created active session, including empty sessions. */
export function getLeagueLiveSessionId(
  sessions: readonly LeagueSessionSummary[] | undefined,
): number | null {
  return sessions?.reduce<number | null>((latest, session) =>
    session.status === 'ACTIVE' && (latest == null || session.id > latest)
      ? session.id : latest, null) ?? null;
}
