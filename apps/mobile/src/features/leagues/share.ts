import { PUBLIC_WEB_ORIGIN } from '@/lib/publicUrls';
import { shareLink } from '@/utils/share';

export interface LeagueInvitationShare {
  readonly url: string;
  readonly title: string;
  readonly message: string;
}

export function buildLeagueInvitationShare(
  leagueId: number | string,
  leagueName: string,
): LeagueInvitationShare {
  const numericId = Number(leagueId);
  const name = leagueName.trim();
  if (!Number.isInteger(numericId) || numericId <= 0 || name === '') {
    throw new Error('League details are unavailable');
  }
  const url = `${PUBLIC_WEB_ORIGIN}/league/${numericId}`;
  return {
    url,
    title: `Share ${name}`,
    message: `Join ${name} on Beach League: ${url}`,
  };
}

export async function shareLeagueInvitation(
  leagueId: number | string,
  leagueName: string,
): Promise<void> {
  const invitation = buildLeagueInvitationShare(leagueId, leagueName);
  await shareLink(invitation.url, invitation.title, invitation.message);
}
