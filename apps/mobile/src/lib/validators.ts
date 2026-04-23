/**
 * Zod validation schemas for forms used throughout the Beach League mobile app.
 *
 * Import the inferred TypeScript types alongside each schema:
 *   import { loginSchema, type LoginFormValues } from '@/lib/validators';
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

/**
 * US phone number schema.
 * Strips formatting (spaces, dashes, parens) then validates 10-digit
 * format with optional +1 prefix.
 */
export const phoneSchema = z
  .string()
  .min(1, 'Phone number is required.')
  .transform((val) => val.replace(/[\s\-()]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^\+?1?\d{10}$/, 'Please enter a valid US phone number.'),
  );

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters.');

const otpCodeField = z
  .string()
  .length(6, 'Code must be exactly 6 digits.')
  .regex(/^\d{6}$/, 'Code must contain only digits.');

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

/**
 * Login form schema — email + password.
 * The mobile UI is email-only; phone sign-in is not offered here.
 */
export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: passwordField,
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Sign-up form schema.
 * Email is required (mobile is email-first); phone number is optional.
 */
export const signupSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Please enter a valid email address.'),
  phoneNumber: phoneSchema.optional().or(z.literal('')),
  password: passwordField,
});

export type SignupFormValues = z.infer<typeof signupSchema>;

/**
 * OTP verification schema — exactly 6 numeric digits.
 */
export const otpSchema = z.object({
  code: otpCodeField,
});

export type OtpFormValues = z.infer<typeof otpSchema>;

/**
 * Reset password request — phone number variant.
 */
export const resetPasswordRequestSchema = z.object({
  phoneNumber: phoneSchema,
});

export type ResetPasswordRequestFormValues = z.infer<
  typeof resetPasswordRequestSchema
>;

/**
 * Reset password request — email variant (mobile default).
 */
export const resetPasswordEmailRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .email('Please enter a valid email address.'),
});

export type ResetPasswordEmailRequestFormValues = z.infer<
  typeof resetPasswordEmailRequestSchema
>;

/**
 * Reset password — final step after OTP has been verified.
 * At this point we already hold the reset_token, so only the new
 * password + its confirmation need validation.
 */
export const setNewPasswordSchema = z
  .object({
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type SetNewPasswordFormValues = z.infer<typeof setNewPasswordSchema>;

/**
 * Onboarding schema — required fields for profile completion.
 * gender + level + city + locationId are required by the backend to mark
 * profile_complete = true.
 */
/**
 * Keep these tuples in lockstep with `GENDER_OPTIONS` /
 * `SKILL_LEVEL_OPTIONS` from `@beach-kings/shared`. The shared constants
 * drive the UI; these drive the zod schema (z.enum requires a literal tuple).
 */
export const GENDER_VALUES = ['male', 'female'] as const;

export const SKILL_LEVEL_VALUES = [
  'juniors',
  'beginner',
  'intermediate',
  'advanced',
  'AA',
  'Open',
] as const;

/**
 * Validate a MM/DD/YYYY birthday string. Returns an error message when the
 * value is malformed, not a real calendar date, in the future, or outside
 * the allowed age range. Returns null when the value is valid OR empty
 * (date of birth is optional during onboarding).
 */
export const MIN_AGE_YEARS = 13;
export const MAX_AGE_YEARS = 120;

export function validateBirthdayDisplay(display: string): string | null {
  if (display.length === 0) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return 'Enter date as MM/DD/YYYY.';
  const [, mStr, dStr, yStr] = match;
  const month = Number(mStr);
  const day = Number(dStr);
  const year = Number(yStr);
  if (month < 1 || month > 12) return 'Month must be between 01 and 12.';
  if (day < 1 || day > 31) return 'Day must be between 01 and 31.';
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return 'That date does not exist.';
  }
  const now = new Date();
  if (date.getTime() > now.getTime()) {
    return 'Date of birth cannot be in the future.';
  }
  const minBirth = new Date(
    now.getFullYear() - MAX_AGE_YEARS,
    now.getMonth(),
    now.getDate(),
  );
  if (date.getTime() < minBirth.getTime()) return 'Please enter a valid year.';
  const maxBirth = new Date(
    now.getFullYear() - MIN_AGE_YEARS,
    now.getMonth(),
    now.getDate(),
  );
  if (date.getTime() > maxBirth.getTime()) {
    return `You must be at least ${MIN_AGE_YEARS} years old.`;
  }
  return null;
}

/**
 * Convert a validated MM/DD/YYYY display string to ISO YYYY-MM-DD.
 * Returns '' when input is empty or fails validation — callers should
 * rely on the schema to reject invalid input before calling this.
 */
export function birthdayDisplayToIso(display: string): string {
  if (validateBirthdayDisplay(display) !== null) return '';
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return '';
  const [, m, d, y] = match;
  return `${y}-${m}-${d}`;
}

export const onboardingSchema = z.object({
  gender: z.enum(GENDER_VALUES, {
    error: 'Please select a gender.',
  }),
  level: z.enum(SKILL_LEVEL_VALUES, {
    error: 'Please select a skill level.',
  }),
  city: z.string().min(1, 'City is required.'),
  locationId: z.string().min(1, 'Please select a location.'),
  nickname: z.string().optional(),
  dateOfBirth: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      const message = validateBirthdayDisplay((val ?? '').trim());
      if (message !== null) {
        ctx.addIssue({ code: 'custom', message });
      }
    }),
});

export type OnboardingFormValues = z.infer<typeof onboardingSchema>;

// ---------------------------------------------------------------------------
// Profile schema
// ---------------------------------------------------------------------------

/**
 * Schema for the profile-update form.
 * All fields are optional; only the provided fields will be sent to the API.
 */
export const profileUpdateSchema = z.object({
  firstName: z.string().min(1, 'First name cannot be blank.').optional(),
  lastName: z.string().min(1, 'Last name cannot be blank.').optional(),
  gender: z.enum(GENDER_VALUES).optional(),
  level: z.enum(SKILL_LEVEL_VALUES).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});

export type ProfileUpdateFormValues = z.infer<typeof profileUpdateSchema>;
