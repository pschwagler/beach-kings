import { shareLink } from '@/utils/share';

const SESSION_WEB_URL = 'https://beachleaguevb.com/session';

export class SessionInvitationUnavailableError extends Error {
  constructor() {
    super('This session does not have a share code yet.');
    this.name = 'SessionInvitationUnavailableError';
  }
}

export function buildSessionInvitation(code: string): {
  readonly code: string;
  readonly url: string;
  readonly message: string;
} {
  const normalizedCode = code.trim().toUpperCase();
  if (normalizedCode.length === 0) {
    throw new SessionInvitationUnavailableError();
  }
  const url = `${SESSION_WEB_URL}/${encodeURIComponent(normalizedCode)}`;
  return {
    code: normalizedCode,
    url,
    message: `Join my Beach League session with code ${normalizedCode}: ${url}`,
  };
}

/** Open the native share sheet for a stable session-code invitation. */
export async function shareSessionInvitation(
  code: string | null | undefined,
): Promise<void> {
  if (code == null) throw new SessionInvitationUnavailableError();
  const invitation = buildSessionInvitation(code);
  await shareLink(
    invitation.url,
    'Share Session',
    invitation.message,
  );
}
