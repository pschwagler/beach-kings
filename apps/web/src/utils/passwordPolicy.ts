export const MIN_PASSWORD_LENGTH = 8;

/** Password creation policy shared by signup and reset-password UI. */
export function validatePassword(password: string): { minLength: boolean } {
  return { minLength: password.length >= MIN_PASSWORD_LENGTH };
}
