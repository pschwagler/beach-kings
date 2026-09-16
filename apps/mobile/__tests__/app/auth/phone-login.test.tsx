import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PhoneLoginForm from '@/components/forms/PhoneLoginForm';

const mockSendLoginCode = jest.fn();
const mockLoginWithSms = jest.fn();
const mockLogin = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  sendLoginCode: mockSendLoginCode, loginWithSms: mockLoginWithSms, login: mockLogin,
}) }));
jest.mock('@/utils/haptics', () => ({ hapticLight: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));

describe('Phone login', () => {
  beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  async function sendCode() {
    const screen = render(<PhoneLoginForm onCancel={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('Phone number'), '(202) 555-0123');
    fireEvent.press(screen.getByLabelText('Send login code'));
    await waitFor(() => expect(screen.getByLabelText('6-digit code')).toBeTruthy());
    return screen;
  }

  it('validates numbers before sending', () => {
    const screen = render(<PhoneLoginForm onCancel={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Send login code'));
    expect(mockSendLoginCode).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('normalizes the number and uses SMS login, without registration', async () => {
    const screen = await sendCode();
    expect(mockSendLoginCode).toHaveBeenCalledWith('+12025550123');
    fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    fireEvent.press(screen.getByLabelText('Log In'));
    await waitFor(() => expect(mockLoginWithSms).toHaveBeenCalledWith('+12025550123', '123456'));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('validates incomplete codes and shows expiry errors with retry available', async () => {
    const screen = await sendCode();
    fireEvent.press(screen.getByLabelText('Log In'));
    expect(mockLoginWithSms).not.toHaveBeenCalled();
    mockLoginWithSms.mockRejectedValueOnce(new Error('Expired'));
    fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    fireEvent.press(screen.getByLabelText('Log In'));
    await waitFor(() => expect(screen.getByText('The code is invalid or expired. Try again or request a new code.')).toBeTruthy());
    expect(screen.getByLabelText('6-digit code').props.value).toBe('123456');
  });

  it('throttles resends and permits a new request after the countdown', async () => {
    const screen = await sendCode();
    fireEvent.press(screen.getByLabelText('Resend code in 60s'));
    expect(mockSendLoginCode).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 60; i += 1) await act(async () => { jest.advanceTimersByTime(1000); });
    fireEvent.press(screen.getByLabelText('Resend code'));
    await waitFor(() => expect(mockSendLoginCode).toHaveBeenCalledTimes(2));
  });

  it('keeps phone/password login available', async () => {
    const screen = render(<PhoneLoginForm onCancel={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Use phone and password'));
    fireEvent.changeText(screen.getByPlaceholderText('Phone number'), '2025550123');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    fireEvent.press(screen.getByLabelText('Log In'));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ phoneNumber: '+12025550123', password: 'password123' }));
  });

  it('shows server retry guidance and lets a failed send be retried', async () => {
    mockSendLoginCode.mockRejectedValueOnce({ response: { status: 429, data: { detail: 'Too many requests. Try again later.' } } });
    const screen = render(<PhoneLoginForm onCancel={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('Phone number'), '2025550123');
    fireEvent.press(screen.getByLabelText('Send login code'));
    await waitFor(() => expect(screen.getByText('Too many requests. Try again later.')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Send login code'));
    await waitFor(() => expect(screen.getByLabelText('6-digit code')).toBeTruthy());
    expect(mockSendLoginCode).toHaveBeenCalledTimes(2);
  });

  it('clears the old challenge when changing phone numbers', async () => {
    const screen = await sendCode();
    fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    fireEvent.press(screen.getByLabelText('Use another number'));
    fireEvent.changeText(screen.getByPlaceholderText('Phone number'), '2025550124');
    fireEvent.press(screen.getByLabelText('Send login code'));
    await waitFor(() => expect(mockSendLoginCode).toHaveBeenLastCalledWith('+12025550124'));
    expect(screen.getByLabelText('6-digit code').props.value).toBe('');
  });

  it('prevents duplicate sends while a request is pending', async () => {
    let resolve: (() => void) | undefined;
    mockSendLoginCode.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    const screen = render(<PhoneLoginForm onCancel={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('Phone number'), '2025550123');
    fireEvent.press(screen.getByLabelText('Send login code'));
    fireEvent.press(screen.getByLabelText('Send login code'));
    expect(mockSendLoginCode).toHaveBeenCalledTimes(1);
    await act(async () => { resolve?.(); });
  });

  it('allows cancellation without authenticating', () => {
    const onCancel = jest.fn();
    const screen = render(<PhoneLoginForm onCancel={onCancel} />);
    fireEvent.press(screen.getByLabelText('Back to email login'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mockLoginWithSms).not.toHaveBeenCalled();
  });
});
