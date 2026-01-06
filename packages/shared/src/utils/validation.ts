/**
 * Validation utilities
 */

/**
 * Validate email format
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format (basic validation)
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');
  // Check if it has 10-15 digits (international format)
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

/**
 * Validate that a value is not empty
 */
export function isNotEmpty(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}





