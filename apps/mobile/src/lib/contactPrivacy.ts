/** Mask an email only when it is displayed in an unauthenticated recovery flow. */
export function maskRecoveryEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'this email';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'•'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}
