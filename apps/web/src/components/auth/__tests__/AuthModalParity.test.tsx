import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
const methods = vi.hoisted(() => ({
  loginWithGoogle: vi.fn(), completeAppleLogin: vi.fn(), loginWithPassword: vi.fn(), loginWithSms: vi.fn(),
  signup: vi.fn(), sendVerificationCode: vi.fn(), verifyPhone: vi.fn(), resetPassword: vi.fn(), verifyPasswordReset: vi.fn(), confirmPasswordReset: vi.fn(),
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => methods }));
vi.mock('../AppleAuthButton', () => ({ default: () => null }));
vi.mock('../GoogleAuthButton', () => ({ default: () => null }));
vi.mock('../../../services/api', () => ({ default: { post: vi.fn() } }));
vi.mock('../../ui/PhoneInput', () => ({ default: ({ value, onChange, onValidationChange }: { value: string; onChange: (value: string) => void; onValidationChange: (result: { isValid: boolean }) => void }) => <input aria-label="Phone" value={value} onChange={e => { onChange(e.target.value); onValidationChange({ isValid: true }); }} /> }));
import AuthModal from '../AuthModal';
import api from '../../../services/api';

beforeEach(() => vi.clearAllMocks());
it('allows email password login without requiring a phone number', async () => {
  methods.loginWithPassword.mockResolvedValue(undefined);
  const close = vi.fn();
  render(<AuthModal isOpen onClose={close} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Email' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
  await waitFor(() => expect(methods.loginWithPassword).toHaveBeenCalledWith('person@example.com', 'password'));
  expect(close).toHaveBeenCalled();
});

it('retains an accessible phone field for the SMS login flow', () => {
  render(<AuthModal isOpen />);
  fireEvent.click(screen.getByRole('button', { name: /text code instead/ }));
  expect(screen.getByRole('textbox', { name: 'Phone' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /password instead/ })).toBeInTheDocument();
});

it('renders structured provider errors as safe text without crashing', async () => {
  methods.loginWithPassword.mockRejectedValue({ response: { data: { detail: { code: 'CONFLICT', message: 'Use your original sign-in method.' } } } });
  render(<AuthModal isOpen />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Phone' }), { target: { value: '+15555550123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
  expect(await screen.findByText('Use your original sign-in method.')).toBeInTheDocument();
});

it('completes email signup, resend and verification without any phone input', async () => {
  vi.mocked(api.post).mockResolvedValue({ data: { eligibility_token: 'test-eligibility' } });
  methods.signup.mockResolvedValue({ email: 'person@example.com' });
  methods.verifyPhone.mockResolvedValue({ profile_complete: true });
  const close = vi.fn();
  render(<AuthModal isOpen mode="sign-up" onClose={close} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Country' }), { target: { value: 'US' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'State code' }), { target: { value: 'NY' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Age range' }), { target: { value: 'adult' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to account details' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Email' }));
  fireEvent.change(screen.getByRole('textbox', { name: /First Name/ }), { target: { value: 'Test' } });
  fireEvent.change(screen.getByRole('textbox', { name: /Last Name/ }), { target: { value: 'Player' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  await waitFor(() => expect(methods.signup).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: undefined, email: 'person@example.com', eligibilityToken: 'test-eligibility' })));
  fireEvent.click(await screen.findByRole('button', { name: 'Send Code' }));
  await waitFor(() => expect(methods.sendVerificationCode).toHaveBeenCalledWith('person@example.com'));
  fireEvent.change(screen.getByRole('textbox', { name: /Verification Code/ }), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Account' }));
  await waitFor(() => expect(methods.verifyPhone).toHaveBeenCalledWith('person@example.com', '123456'));
  expect(close).toHaveBeenCalled();
});

it('completes email recovery through code verification and a new password', async () => {
  methods.resetPassword.mockResolvedValue({});
  methods.verifyPasswordReset.mockResolvedValue({ reset_token: 'test-reset' });
  methods.confirmPasswordReset.mockResolvedValue({});
  render(<AuthModal isOpen mode="reset-password" />);
  fireEvent.click(screen.getByRole('radio', { name: 'Email' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'person@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Code' }));
  await waitFor(() => expect(methods.resetPassword).toHaveBeenCalledWith('person@example.com'));
  fireEvent.change(await screen.findByRole('textbox', { name: /Verification Code/ }), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(methods.verifyPasswordReset).toHaveBeenCalledWith('person@example.com', '123456'));
  fireEvent.change(await screen.findByLabelText(/Password/), { target: { value: 'new-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
  await waitFor(() => expect(methods.confirmPasswordReset).toHaveBeenCalledWith('test-reset', 'new-password'));
});
