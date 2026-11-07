import type { LeagueSessionSummary } from '@beach-kings/shared';

/** Match the Games list: ACTIVE first, newest session id first. Includes empty sessions. */
export function getLeagueLiveSessionId(
  sessions: readonly LeagueSessionSummary[] | undefined,
): number | null {
  return sessions?.reduce<number | null>((latest, session) =>
    session.status === 'ACTIVE' && (latest == null || session.id > latest)
      ? session.id : latest, null) ?? null;
}
