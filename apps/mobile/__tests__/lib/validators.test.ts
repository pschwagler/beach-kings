/**
 * Tests for Zod validation schemas in @/lib/validators.
 */
import {
  phoneSchema,
  loginSchema,
  signupSchema,
  otpSchema,
  resetPasswordRequestSchema,
  resetPasswordEmailRequestSchema,
  setNewPasswordSchema,
  onboardingSchema,
  profileUpdateSchema,
} from '@/lib/validators';

// ---------------------------------------------------------------------------
// phoneSchema
// ---------------------------------------------------------------------------
describe('phoneSchema', () => {
  it('accepts a plain 10-digit number', () => {
    const result = phoneSchema.safeParse('2125551234');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('2125551234');
  });

  it('accepts a number with +1 prefix', () => {
    const result = phoneSchema.safeParse('+12125551234');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('+12125551234');
  });

  it('strips dashes, spaces, and parens before validating', () => {
    const result = phoneSchema.safeParse('(212) 555-1234');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('2125551234');
  });

  it('strips dashes from +1 prefixed numbers', () => {
    const result = phoneSchema.safeParse('+1-212-555-1234');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('+12125551234');
  });

  it('rejects numbers with fewer than 10 digits', () => {
    expect(phoneSchema.safeParse('212555').success).toBe(false);
  });

  it('rejects numbers with more than 11 digits (no +)', () => {
    expect(phoneSchema.safeParse('112125551234').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(phoneSchema.safeParse('').success).toBe(false);
  });

  it('rejects letters', () => {
    expect(phoneSchema.safeParse('abcdefghij').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loginSchema — email + password
// ---------------------------------------------------------------------------
describe('loginSchema', () => {
  it('passes with valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'secret123',
    });
    expect(result.success).toBe(true);
  });

  it('fails when email is invalid', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'secret123',
    });
    expect(result.success).toBe(false);
  });

  it('fails when password is too short', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('fails when email is missing', () => {
    const result = loginSchema.safeParse({ password: 'secret123' });
    expect(result.success).toBe(false);
  });

  it('fails when password is missing', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// signupSchema
// ---------------------------------------------------------------------------
describe('signupSchema', () => {
  const validSignup = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    password: 'password123',
  };

  it('passes with valid input (email required, no phone)', () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
  });

  it('passes with optional phone number included', () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      phoneNumber: '2125551234',
    });
    expect(result.success).toBe(true);
  });

  it('strips phone formatting when phone is provided', () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      phoneNumber: '(212) 555-1234',
    });
    expect(result.success).toBe(true);
  });

  it('fails when email is missing', () => {
    const { email: _omitted, ...rest } = validSignup;
    expect(signupSchema.safeParse(rest).success).toBe(false);
  });

  it('fails when email is invalid', () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      email: 'bad-email',
    });
    expect(result.success).toBe(false);
  });

  it('fails when firstName is missing', () => {
    const { firstName: _omitted, ...rest } = validSignup;
    expect(signupSchema.safeParse(rest).success).toBe(false);
  });

  it('fails when lastName is missing', () => {
    const { lastName: _omitted, ...rest } = validSignup;
    expect(signupSchema.safeParse(rest).success).toBe(false);
  });

  it('fails when password is too short', () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid phone format when provided', () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      phoneNumber: '123',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty string for optional phone', () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      phoneNumber: '',
    });
    expect(result.success).toBe(true);
  });

  it('accepts undefined phone', () => {
    const result = signupSchema.safeParse({
      ...validSignup,
      phoneNumber: undefined,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// otpSchema
// ---------------------------------------------------------------------------
describe('otpSchema', () => {
  it('accepts a 6-digit code', () => {
    const result = otpSchema.safeParse({ code: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects a code shorter than 6 digits', () => {
    expect(otpSchema.safeParse({ code: '12345' }).success).toBe(false);
  });

  it('rejects a code longer than 6 digits', () => {
    expect(otpSchema.safeParse({ code: '1234567' }).success).toBe(false);
  });

  it('rejects non-numeric characters', () => {
    expect(otpSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(otpSchema.safeParse({ code: '' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resetPasswordRequestSchema
// ---------------------------------------------------------------------------
describe('resetPasswordRequestSchema', () => {
  it('passes with a valid phone number', () => {
    const result = resetPasswordRequestSchema.safeParse({
      phoneNumber: '2125551234',
    });
    expect(result.success).toBe(true);
  });

  it('strips phone formatting', () => {
    const result = resetPasswordRequestSchema.safeParse({
      phoneNumber: '(212) 555-1234',
    });
    expect(result.success).toBe(true);
  });

  it('fails with an invalid phone number', () => {
    expect(
      resetPasswordRequestSchema.safeParse({ phoneNumber: '123' }).success,
    ).toBe(false);
  });

  it('fails when phone is missing', () => {
    expect(resetPasswordRequestSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resetPasswordEmailRequestSchema
// ---------------------------------------------------------------------------
describe('resetPasswordEmailRequestSchema', () => {
  it('passes with a valid email address', () => {
    const result = resetPasswordEmailRequestSchema.safeParse({
      email: 'user@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('trims whitespace from the email', () => {
    const result = resetPasswordEmailRequestSchema.safeParse({
      email: '  user@example.com  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('user@example.com');
  });

  it('fails with an invalid email', () => {
    expect(
      resetPasswordEmailRequestSchema.safeParse({ email: 'not-an-email' })
        .success,
    ).toBe(false);
  });

  it('fails when email is missing', () => {
    expect(resetPasswordEmailRequestSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setNewPasswordSchema
// ---------------------------------------------------------------------------
describe('setNewPasswordSchema', () => {
  const valid = {
    newPassword: 'newpass123',
    confirmPassword: 'newpass123',
  };

  it('passes with valid matching input', () => {
    expect(setNewPasswordSchema.safeParse(valid).success).toBe(true);
  });

  it('fails when passwords do not match', () => {
    const result = setNewPasswordSchema.safeParse({
      ...valid,
      confirmPassword: 'mismatch',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((e) => e.path.join('.'));
      expect(paths).toContain('confirmPassword');
    }
  });

  it('fails when newPassword is too short', () => {
    expect(
      setNewPasswordSchema.safeParse({
        newPassword: 'short',
        confirmPassword: 'short',
      }).success,
    ).toBe(false);
  });

  it('fails when confirmPassword is missing', () => {
    expect(
      setNewPasswordSchema.safeParse({ newPassword: 'newpass123' }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onboardingSchema
// ---------------------------------------------------------------------------
describe('onboardingSchema', () => {
  const valid = {
    gender: 'male' as const,
    level: 'advanced' as const,
    city: 'San Diego',
    locationId: 'socal_sd',
  };

  it('passes with all required fields', () => {
    expect(onboardingSchema.safeParse(valid).success).toBe(true);
  });

  it('passes with optional fields included', () => {
    const result = onboardingSchema.safeParse({
      ...valid,
      nickname: 'Johnny',
      dateOfBirth: '05/15/1990',
    });
    expect(result.success).toBe(true);
  });

  it('accepts every valid skill level', () => {
    for (const level of [
      'juniors',
      'beginner',
      'intermediate',
      'advanced',
      'AA',
      'Open',
    ] as const) {
      expect(onboardingSchema.safeParse({ ...valid, level }).success).toBe(true);
    }
  });

  it('fails when gender is missing', () => {
    const { gender: _omitted, ...rest } = valid;
    expect(onboardingSchema.safeParse(rest).success).toBe(false);
  });

  it('fails when gender is invalid enum', () => {
    expect(
      onboardingSchema.safeParse({ ...valid, gender: 'other' }).success,
    ).toBe(false);
  });

  it('fails when level is missing', () => {
    const { level: _omitted, ...rest } = valid;
    expect(onboardingSchema.safeParse(rest).success).toBe(false);
  });

  it('fails when level is invalid enum', () => {
    expect(
      onboardingSchema.safeParse({ ...valid, level: 'pro' }).success,
    ).toBe(false);
  });

  it('fails when city is missing', () => {
    const { city: _omitted, ...rest } = valid;
    expect(onboardingSchema.safeParse(rest).success).toBe(false);
  });

  it('fails when locationId is missing', () => {
    const { locationId: _omitted, ...rest } = valid;
    expect(onboardingSchema.safeParse(rest).success).toBe(false);
  });

  it('passes with a valid MM/DD/YYYY dateOfBirth', () => {
    const result = onboardingSchema.safeParse({
      ...valid,
      dateOfBirth: '05/15/1990',
    });
    expect(result.success).toBe(true);
  });

  it('passes when dateOfBirth is omitted or empty', () => {
    expect(onboardingSchema.safeParse(valid).success).toBe(true);
    expect(
      onboardingSchema.safeParse({ ...valid, dateOfBirth: '' }).success,
    ).toBe(true);
  });

  it('fails when dateOfBirth has impossible month/day', () => {
    expect(
      onboardingSchema.safeParse({ ...valid, dateOfBirth: '99/99/9999' })
        .success,
    ).toBe(false);
    expect(
      onboardingSchema.safeParse({ ...valid, dateOfBirth: '13/01/1990' })
        .success,
    ).toBe(false);
    expect(
      onboardingSchema.safeParse({ ...valid, dateOfBirth: '02/30/1990' })
        .success,
    ).toBe(false);
  });

  it('fails when dateOfBirth is malformed or partial', () => {
    expect(
      onboardingSchema.safeParse({ ...valid, dateOfBirth: '05/15' }).success,
    ).toBe(false);
    expect(
      onboardingSchema.safeParse({ ...valid, dateOfBirth: '1990-05-15' })
        .success,
    ).toBe(false);
  });

  it('fails when dateOfBirth is in the future', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const mm = String(future.getMonth() + 1).padStart(2, '0');
    const dd = String(future.getDate()).padStart(2, '0');
    const yyyy = future.getFullYear();
    expect(
      onboardingSchema.safeParse({
        ...valid,
        dateOfBirth: `${mm}/${dd}/${yyyy}`,
      }).success,
    ).toBe(false);
  });

  it('fails when user is younger than the minimum age', () => {
    const now = new Date();
    const yyyy = now.getFullYear() - 5;
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    expect(
      onboardingSchema.safeParse({
        ...valid,
        dateOfBirth: `${mm}/${dd}/${yyyy}`,
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// profileUpdateSchema (unchanged, regression tests)
// ---------------------------------------------------------------------------
describe('profileUpdateSchema', () => {
  it('passes with no fields (all optional)', () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('passes with a partial update', () => {
    expect(
      profileUpdateSchema.safeParse({ firstName: 'Jane', city: 'San Diego' })
        .success,
    ).toBe(true);
  });

  it('passes with a valid gender value', () => {
    expect(
      profileUpdateSchema.safeParse({ gender: 'female' }).success,
    ).toBe(true);
  });

  it('fails when firstName is an empty string', () => {
    expect(
      profileUpdateSchema.safeParse({ firstName: '' }).success,
    ).toBe(false);
  });

  it('fails when gender is an invalid enum value', () => {
    expect(
      profileUpdateSchema.safeParse({ gender: 'other' }).success,
    ).toBe(false);
  });
});
