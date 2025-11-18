import { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Check, X as XIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PhoneInput from '../ui/PhoneInput';
import VerificationCodeInput from './VerificationCodeInput';

const MODE_TITLES = {
  'sign-in': 'Log In',
  'sign-up': 'Create Account',
  'sms-login': 'SMS Login',
  verify: 'Verify Phone Number',
  'reset-password': 'Send Code',
  'reset-password-code': 'Continue',
  'reset-password-new': 'Reset Password',
};

const defaultFormState = {
  phoneNumber: '',
  password: '',
  fullName: '',
  email: '',
  code: '',
};

const getErrorMessage = (error) => error.response?.data?.detail || error.message || 'Something went wrong';

export default function AuthModal({ isOpen, mode = 'sign-in', onClose, onVerifySuccess }) {
  const {
    loginWithPassword,
    loginWithSms,
    signup,
    sendVerificationCode,
    verifyPhone,
    resetPassword,
    verifyPasswordReset,
    confirmPasswordReset,
  } = useAuth();
  const [activeMode, setActiveMode] = useState(mode);
  const [formData, setFormData] = useState(defaultFormState);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  const [passwordRequirements, setPasswordRequirements] = useState({
    minLength: false,
    hasNumber: false,
  });
  const [resetToken, setResetToken] = useState(null);
  const [isSignupFlow, setIsSignupFlow] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveMode(mode);
      setErrorMessage('');
      setStatusMessage('');
    }
  }, [isOpen, mode]);

  if (!isOpen) {
    return null;
  }

  const handleClose = () => {
    setActiveMode('sign-in');
    setFormData(defaultFormState);
    setErrorMessage('');
    setStatusMessage('');
    setIsPhoneValid(false);
    setPasswordRequirements({ minLength: false, hasNumber: false });
    setResetToken(null);
    setIsSignupFlow(false);
    onClose?.();
  };

  const validatePassword = (password) => {
    return {
      minLength: password.length >= 8,
      hasNumber: /\d/.test(password),
    };
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Validate password in real-time if it's the password field
    if (name === 'password' && (activeMode === 'sign-up' || activeMode === 'reset-password-new')) {
      setPasswordRequirements(validatePassword(value));
    }
  };

  const handlePhoneChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      phoneNumber: value,
    }));
  };

  const handlePhoneValidation = ({ isValid, value }) => {
    setIsPhoneValid(isValid);
    if (isValid && value) {
      setFormData((prev) => ({
        ...prev,
        phoneNumber: value,
      }));
    }
  };

  const handleSwitchMode = (newMode) => {
    setActiveMode(newMode);
    setErrorMessage('');
    setStatusMessage('');
    setFormData(defaultFormState);
    setIsPhoneValid(false);
    setPasswordRequirements({ minLength: false, hasNumber: false });
    setResetToken(null);
  };

  const handleSendVerification = async () => {
    if (!isPhoneValid || !formData.phoneNumber) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await sendVerificationCode(formData.phoneNumber);
      setStatusMessage('Verification code sent! Please check your SMS messages.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    // Validate phone number if required (not needed for reset-password-new as it's already verified)
    if ((activeMode === 'sign-in' || activeMode === 'sign-up' || activeMode === 'sms-login' || activeMode === 'verify' || activeMode === 'reset-password' || activeMode === 'reset-password-code') && !isPhoneValid) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    // Validate password strength and full name for sign-up
    if (activeMode === 'sign-up') {
      if (!formData.fullName || !formData.fullName.trim()) {
        setErrorMessage('Full name is required');
        return;
      }
      const passwordValid = validatePassword(formData.password);
      if (!passwordValid.minLength || !passwordValid.hasNumber) {
        setErrorMessage('Password must be at least 8 characters long and include a number');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (activeMode === 'sign-in') {
        await loginWithPassword(formData.phoneNumber, formData.password);
        handleClose();
        return;
      }

      if (activeMode === 'sign-up') {
        const result = await signup({
          phoneNumber: formData.phoneNumber,
          password: formData.password,
          fullName: formData.fullName.trim(),
          email: formData.email,
        });
        setStatusMessage('Account created! Enter the verification code we just sent you.');
        setFormData((prev) => ({
          ...prev,
          phoneNumber: result.phone_number || prev.phoneNumber,
        }));
        setIsSignupFlow(true); // Mark that we're in signup flow
        setActiveMode('verify');
        return;
      }

      if (activeMode === 'sms-login') {
        await loginWithSms(formData.phoneNumber, formData.code);
        handleClose();
        return;
      }

      if (activeMode === 'verify') {
        await verifyPhone(formData.phoneNumber, formData.code);
        // If this was a signup flow, notify parent to show player profile modal
        // Wait a bit for auth state to update
        if (isSignupFlow && onVerifySuccess) {
          setTimeout(() => {
            onVerifySuccess();
          }, 300);
        } else {
          // Not signup flow, close modal normally
          handleClose();
        }
        return;
      }

      if (activeMode === 'reset-password') {
        await resetPassword(formData.phoneNumber);
        setStatusMessage('Verification code sent! Please check your SMS messages.');
        setActiveMode('reset-password-code');
        return;
      }

      if (activeMode === 'reset-password-code') {
        // Verify code and get reset token
        if (!formData.code || formData.code.length !== 4) {
          setErrorMessage('Please enter a valid 4-digit verification code');
          return;
        }
        const result = await verifyPasswordReset(formData.phoneNumber, formData.code);
        setResetToken(result.reset_token);
        setActiveMode('reset-password-new');
        setErrorMessage('');
        setStatusMessage('');
        return;
      }

      if (activeMode === 'reset-password-new') {
        // Validate password strength
        const passwordValid = validatePassword(formData.password);
        if (!passwordValid.minLength || !passwordValid.hasNumber) {
          setErrorMessage('Password must be at least 8 characters long and include a number');
          return;
        }
        if (!resetToken) {
          setErrorMessage('Reset token is missing. Please start over.');
          return;
        }
        // This will automatically log the user in
        await confirmPasswordReset(resetToken, formData.password);
        handleClose();
        return;
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDescription = () => {
    switch (activeMode) {
      case 'sign-up':
        return 'Create an account to record matches, manage sessions, and send WhatsApp updates.';
      case 'sms-login':
        return 'Enter your phone number and the code we send via SMS.';
      case 'verify':
        return 'Enter the verification code we sent to your phone to complete signup.';
      case 'reset-password':
        return 'Enter your phone number to receive a verification code for password reset.';
      case 'reset-password-code':
        return 'Enter the verification code we sent to your phone.';
      case 'reset-password-new':
        return 'Enter your new password.';
      default:
        return 'Sign in to access leagues, record matches, and more.';
    }
  };

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <div className="auth-modal__header">
          <div>
            {/* <p className="auth-modal__eyebrow">Beach Volleyball Accounts</p> */}
            <h2>{MODE_TITLES[activeMode]}</h2>
          </div>
          <button className="auth-modal__close" onClick={handleClose} aria-label="Close authentication modal">
            <X size={20} />
          </button>
        </div>

        <p className="auth-modal__description">{renderDescription()}</p>

        {(statusMessage || errorMessage) && (
          <div className={`auth-modal__alert ${errorMessage ? 'error' : 'success'}`}>
            {errorMessage ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span>{errorMessage || statusMessage}</span>
          </div>
        )}

        <form className="auth-modal__form" onSubmit={handleSubmit}>
          {activeMode === 'sign-up' && (
            <label className="auth-modal__label">
              <span>Full Name <span style={{ color: 'red' }}>*</span></span>
              <input
                type="text"
                name="fullName"
                className="auth-modal__input"
                placeholder="John Doe"
                value={formData.fullName}
                onChange={handleInputChange}
                required
              />
            </label>
          )}

          {(activeMode === 'sign-in' || activeMode === 'sign-up' || activeMode === 'reset-password' || activeMode === 'reset-password-code') && (
            <label className="auth-modal__label">
              <span>Phone Number <span style={{ color: 'red' }}>*</span></span>
              <PhoneInput
                value={formData.phoneNumber}
                onChange={handlePhoneChange}
                onValidationChange={handlePhoneValidation}
                required
                placeholder="(555) 123-4567"
              />
            </label>
          )}

          {activeMode === 'reset-password-new' && (
            <label className="auth-modal__label">
              Phone Number
              <input
                type="tel"
                className="auth-modal__input"
                value={formData.phoneNumber}
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </label>
          )}

          {(activeMode === 'sign-in' || activeMode === 'sign-up' || activeMode === 'reset-password-new') && (
            <label className="auth-modal__label">
              <span>Password <span style={{ color: 'red' }}>*</span></span>
              <input
                type="password"
                name="password"
                className="auth-modal__input"
                placeholder=""
                value={formData.password}
                onChange={handleInputChange}
                required
              />
              {(activeMode === 'sign-up' || activeMode === 'reset-password-new') && (
                <div className="auth-modal__password-requirements">
                  <div className={`auth-modal__requirement ${passwordRequirements.minLength ? 'valid' : ''}`}>
                    {passwordRequirements.minLength ? (
                      <Check size={14} className="auth-modal__requirement-icon" />
                    ) : (
                      <XIcon size={14} className="auth-modal__requirement-icon" />
                    )}
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`auth-modal__requirement ${passwordRequirements.hasNumber ? 'valid' : ''}`}>
                    {passwordRequirements.hasNumber ? (
                      <Check size={14} className="auth-modal__requirement-icon" />
                    ) : (
                      <XIcon size={14} className="auth-modal__requirement-icon" />
                    )}
                    <span>Includes a number</span>
                  </div>
                </div>
              )}
            </label>
          )}

          {activeMode === 'reset-password-code' && (
            <VerificationCodeInput
              value={formData.code}
              onChange={handleInputChange}
            />
          )}

          {activeMode === 'sign-up' && (
            <label className="auth-modal__label">
              Email
              <input
                type="email"
                name="email"
                className="auth-modal__input"
                placeholder="Optional"
                value={formData.email}
                onChange={handleInputChange}
              />
            </label>
          )}

          {(activeMode === 'sms-login' || activeMode === 'verify') && (
            <VerificationCodeInput
              value={formData.code}
              onChange={handleInputChange}
              onSendCode={handleSendVerification}
              isSubmitting={isSubmitting}
            />
          )}

          <button type="submit" className="auth-modal__submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : MODE_TITLES[activeMode]}
          </button>
        </form>

          {activeMode === 'sign-in' && (
            <div className="auth-modal__footer">
              <span className="auth-modal__footer-text">Don't have an account? </span>
              <button
                type="button"
                className="auth-modal__footer-link"
                onClick={() => handleSwitchMode('sign-up')}
              >
                Sign up
              </button>
              <span className="auth-modal__footer-text" style={{ marginLeft: '12px' }}>• </span>
              <button
                type="button"
                className="auth-modal__footer-link"
                onClick={() => handleSwitchMode('reset-password')}
              >
                Forgot password?
              </button>
            </div>
          )}

          {activeMode === 'sign-up' && (
            <div className="auth-modal__footer">
              <span className="auth-modal__footer-text">Already have an account? </span>
              <button
                type="button"
                className="auth-modal__footer-link"
                onClick={() => handleSwitchMode('sign-in')}
              >
                Log in
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

