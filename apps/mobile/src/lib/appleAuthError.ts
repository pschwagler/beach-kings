/** Map only known safe categories; never display raw provider/library errors. */
export function getAppleAuthError(error: unknown): { message: string; needsSignup: boolean } {
  const shaped = error as {
    response?: { status?: number; data?: { detail?: { code?: string } } };
    code?: string;
  } | null;
  const code = shaped?.response?.data?.detail?.code;
  const messages: Record<string, string> = {
    APPLE_AUTH_CONFLICT: 'Sign in with your original method, then connect Apple in Settings.',
    APPLE_AUTH_ELIGIBILITY: 'Please start from Sign Up and complete the age check before creating your account.',
    APPLE_AUTH_CONFIG: 'Apple sign-in is temporarily unavailable. Please use another sign-in method or try again later.',
    APPLE_AUTH_PROVIDER: 'Apple could not complete sign-in. Please try again in a moment.',
    APPLE_AUTH_RETRY: 'Apple authorization expired or could not be verified. Please start Apple sign-in again.',
  };
  const networkFailure = !shaped?.response && ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(shaped?.code ?? '');
  return {
    message: (code && messages[code]) || (networkFailure
      ? 'Check your connection, then start Apple sign-in again.'
      : shaped?.response?.status === 429
        ? 'Too many sign-in attempts. Please wait a moment before trying again.'
        : 'Apple sign-in could not finish. Please try again.'),
    needsSignup: code === 'APPLE_AUTH_ELIGIBILITY',
  };
}
