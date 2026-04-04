import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/**
 * Navigate to the correct page for a match record.
 * League matches → /league/[id]?tab=matches&season=[seasonId]
 * Pickup matches → /session/[code]
 */
export function navigateToMatch(
  router: AppRouterInstance,
  match: { league_id?: number | string | null; season_id?: number | string | null; session_code?: string | null }
): void {
  if (match.league_id) {
    const params = new URLSearchParams();
    params.set('tab', 'matches');
    if (match.season_id) params.set('season', String(match.season_id));
    router.push(`/league/${match.league_id}?${params.toString()}`);
    return;
  }
  if (match.session_code) {
    router.push(`/session/${match.session_code}`);
  }
}

/**
 * Navigate to the correct page for a session card.
 * League sessions → /league/[id]?tab=matches&season=[seasonId]
 * Pickup sessions → /session/[code]
 */
export function navigateToSession(
  router: AppRouterInstance,
  session: { league_id?: number | null; season_id?: number | null; code?: string | null }
): void {
  if (session.league_id) {
    const params = new URLSearchParams();
    params.set('tab', 'matches');
    if (session.season_id) params.set('season', String(session.season_id));
    router.push(`/league/${session.league_id}?${params.toString()}`);
    return;
  }
  if (session.code) {
    router.push(`/session/${session.code}`);
  }
}
