import React, { useState, useEffect, useCallback } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TextInput, 
  Pressable, 
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { X, CheckCircle, AlertCircle, Check } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTamaguiTheme } from '../hooks/useTamaguiTheme';
import PhoneInput from './PhoneInput';
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

const getErrorMessage = (error: any) => 
  error.response?.data?.detail || error.message || 'Something went wrong';

interface AuthModalProps {
  isOpen: boolean;
  mode?: keyof typeof MODE_TITLES;
  onClose?: () => void;
  onVerifySuccess?: (profileComplete?: boolean) => void;
}

export default function AuthModal({ isOpen, mode = 'sign-in', onClose, onVerifySuccess }: AuthModalProps) {
  const theme = useTamaguiTheme();
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
  
  const [activeMode, setActiveMode] = useState<keyof typeof MODE_TITLES>(mode);
  const [formData, setFormData] = useState(defaultFormState);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  const [passwordRequirements, setPasswordRequirements] = useState({
    minLength: false,
    hasNumber: false,
  });
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [isSignupFlow, setIsSignupFlow] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveMode(mode);
      setErrorMessage('');
      setStatusMessage('');
    }
  }, [isOpen, mode]);

  const handleClose = () => {
    setActiveMode('sign-in');
    setFormData(defaultFormState);
    setErrorMessage('');
    setStatusMessage('');
    setIsPhoneValid(false);
    setPasswordRequirements({ minLength: false, hasNumber: false });
    setResetToken(null);
    setIsSignupFlow(false);
    setFocusedInput(null);
    onClose?.();
  };

  const validatePassword = (password: string) => {
    return {
      minLength: password.length >= 8,
      hasNumber: /\d/.test(password),
    };
  };

  const handleInputChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Validate password in real-time if it's the password field
    if (name === 'password' && (activeMode === 'sign-up' || activeMode === 'reset-password-new')) {
      setPasswordRequirements(validatePassword(value));
    }
  };

  const handlePhoneChange = useCallback((value: string) => {
    setFormData((prev) => ({
      ...prev,
      phoneNumber: value,
    }));
  }, []);

  const handlePhoneValidation = useCallback(({ isValid }: { isValid: boolean }) => {
    setIsPhoneValid(isValid);
  }, []);

  const handleSwitchMode = (newMode: keyof typeof MODE_TITLES) => {
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
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setErrorMessage('');
    setStatusMessage('');

    // Validate phone number if required
    if ((activeMode === 'sign-in' || activeMode === 'sign-up' || activeMode === 'sms-login' || 
         activeMode === 'verify' || activeMode === 'reset-password' || activeMode === 'reset-password-code') 
        && !isPhoneValid) {
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
        setIsSignupFlow(true);
        setActiveMode('verify');
        return;
      }

      if (activeMode === 'sms-login') {
        await loginWithSms(formData.phoneNumber, formData.code);
        handleClose();
        return;
      }

      if (activeMode === 'verify') {
        const result = await verifyPhone(formData.phoneNumber, formData.code);
        // If this was a signup flow, close modal first, then notify parent
        if (isSignupFlow && onVerifySuccess) {
          handleClose();
          // Wait a bit for auth state to update and modal to close
          setTimeout(() => {
            onVerifySuccess(result?.profile_complete);
          }, 300);
        } else {
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
        await confirmPasswordReset(resetToken, formData.password);
        handleClose();
        return;
      }
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDescription = () => {
    switch (activeMode) {
      case 'sign-up':
        return 'Create an account to continue.';
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
        return 'Log in to access leagues, record games, and more.';
    }
  };

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      padding: theme.spacing.lg,
      maxHeight: '85%',
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: theme.colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: theme.spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.md,
    },
    title: {
      fontSize: theme.fontSize['2xl'],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.textPrimary,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
    description: {
      fontSize: theme.fontSize.base,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.md,
    },
    alertContainer: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: errorMessage ? theme.colors.dangerLight : theme.colors.successLight,
      alignItems: 'center',
      marginBottom: theme.spacing.md,
    },
    alertText: {
      fontSize: theme.fontSize.sm,
      color: errorMessage ? theme.colors.danger : theme.colors.success,
      flex: 1,
    },
    formContainer: {
      gap: theme.spacing.md,
    },
    fieldContainer: {
      gap: theme.spacing.xs,
    },
    label: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textPrimary,
    },
    labelRequired: {
      color: theme.colors.danger,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: theme.fontSize.base,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.backgroundLight,
    },
    inputFocused: {
      borderColor: theme.colors.oceanBlue,
    },
    inputDisabled: {
      opacity: 0.5,
      backgroundColor: theme.colors.gray200,
    },
    passwordRequirements: {
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    },
    requirementRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
      alignItems: 'center',
    },
    requirementText: {
      fontSize: theme.fontSize.xs,
      color: theme.colors.textSecondary,
    },
    submitButton: {
      backgroundColor: theme.colors.oceanBlue,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: theme.spacing.md,
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textWhite,
    },
    footerContainer: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
      justifyContent: 'center',
      flexWrap: 'wrap',
      marginTop: theme.spacing.sm,
    },
    footerText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    footerLink: {
      padding: 0,
      backgroundColor: 'transparent',
    },
    footerLinkText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.oceanBlue,
      textDecorationLine: 'underline',
    },
  });

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalContent}>
            <View style={styles.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ gap: theme.spacing.md }}>
                {/* Header */}
                <View style={styles.header}>
                  <Text style={styles.title}>{MODE_TITLES[activeMode]}</Text>
                  <Pressable onPress={handleClose} style={styles.closeButton}>
                    <X size={20} color={theme.colors.textPrimary} />
                  </Pressable>
                </View>

                {/* Description */}
                <Text style={styles.description}>{renderDescription()}</Text>

                {/* Status/Error Messages */}
                {(statusMessage || errorMessage) && (
                  <View style={styles.alertContainer}>
                    {errorMessage ? (
                      <AlertCircle size={18} color={theme.colors.danger} />
                    ) : (
                      <CheckCircle size={18} color={theme.colors.success} />
                    )}
                    <Text style={styles.alertText}>
                      {errorMessage || statusMessage}
                    </Text>
                  </View>
                )}

                {/* Form */}
                <View style={styles.formContainer}>
                  {activeMode === 'sign-up' && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.label}>
                        Full Name <Text style={styles.labelRequired}>*</Text>
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          focusedInput === 'fullName' && styles.inputFocused,
                        ]}
                        value={formData.fullName}
                        onChangeText={(text) => handleInputChange('fullName', text)}
                        onFocus={() => setFocusedInput('fullName')}
                        onBlur={() => setFocusedInput(null)}
                        placeholder="John Doe"
                        placeholderTextColor={theme.colors.textLight}
                      />
                    </View>
                  )}

                  {(activeMode === 'sign-in' || activeMode === 'sign-up' || 
                    activeMode === 'reset-password' || activeMode === 'reset-password-code') && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.label}>
                        Phone Number <Text style={styles.labelRequired}>*</Text>
                      </Text>
                      <PhoneInput
                        value={formData.phoneNumber}
                        onChange={handlePhoneChange}
                        onValidationChange={handlePhoneValidation}
                        required
                        placeholder="(555) 123-4567"
                      />
                    </View>
                  )}

                  {activeMode === 'reset-password-new' && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.label}>Phone Number</Text>
                      <TextInput
                        style={[styles.input, styles.inputDisabled]}
                        value={formData.phoneNumber}
                        editable={false}
                      />
                    </View>
                  )}

                  {(activeMode === 'sign-in' || activeMode === 'sign-up' || activeMode === 'reset-password-new') && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.label}>
                        Password <Text style={styles.labelRequired}>*</Text>
                      </Text>
                      <TextInput
                        style={[
                          styles.input,
                          focusedInput === 'password' && styles.inputFocused,
                        ]}
                        secureTextEntry
                        value={formData.password}
                        onChangeText={(text) => handleInputChange('password', text)}
                        onFocus={() => setFocusedInput('password')}
                        onBlur={() => setFocusedInput(null)}
                        placeholder=""
                        placeholderTextColor={theme.colors.textLight}
                      />
                      {(activeMode === 'sign-up' || activeMode === 'reset-password-new') && (
                        <View style={styles.passwordRequirements}>
                          <View style={styles.requirementRow}>
                            {passwordRequirements.minLength ? (
                              <Check size={14} color={theme.colors.success} />
                            ) : (
                              <X size={14} color={theme.colors.textLight} />
                            )}
                            <Text style={styles.requirementText}>At least 8 characters</Text>
                          </View>
                          <View style={styles.requirementRow}>
                            {passwordRequirements.hasNumber ? (
                              <Check size={14} color={theme.colors.success} />
                            ) : (
                              <X size={14} color={theme.colors.textLight} />
                            )}
                            <Text style={styles.requirementText}>Includes a number</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {activeMode === 'reset-password-code' && (
                    <VerificationCodeInput
                      value={formData.code}
                      onChange={(event) => handleInputChange('code', event.target.value)}
                    />
                  )}

                  {activeMode === 'sign-up' && (
                    <View style={styles.fieldContainer}>
                      <Text style={styles.label}>Email</Text>
                      <TextInput
                        style={[
                          styles.input,
                          focusedInput === 'email' && styles.inputFocused,
                        ]}
                        keyboardType="email-address"
                        autoComplete="email"
                        textContentType="emailAddress"
                        value={formData.email}
                        onChangeText={(text) => handleInputChange('email', text)}
                        onFocus={() => setFocusedInput('email')}
                        onBlur={() => setFocusedInput(null)}
                        placeholder="Optional"
                        placeholderTextColor={theme.colors.textLight}
                      />
                    </View>
                  )}

                  {(activeMode === 'sms-login' || activeMode === 'verify') && (
                    <VerificationCodeInput
                      value={formData.code}
                      onChange={(event) => handleInputChange('code', event.target.value)}
                      onSendCode={handleSendVerification}
                      isSubmitting={isSubmitting}
                    />
                  )}

                  <Pressable
                    style={[
                      styles.submitButton,
                      isSubmitting && styles.submitButtonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.submitButtonText}>
                      {isSubmitting ? 'Please wait...' : MODE_TITLES[activeMode]}
                    </Text>
                  </Pressable>

                  {/* Footer Links */}
                  {activeMode === 'sign-in' && (
                    <View style={styles.footerContainer}>
                      <Text style={styles.footerText}>Don't have an account? </Text>
                      <Pressable
                        style={styles.footerLink}
                        onPress={() => handleSwitchMode('sign-up')}
                      >
                        <Text style={styles.footerLinkText}>Sign up</Text>
                      </Pressable>
                      <Text style={styles.footerText}> • </Text>
                      <Pressable
                        style={styles.footerLink}
                        onPress={() => handleSwitchMode('reset-password')}
                      >
                        <Text style={styles.footerLinkText}>Forgot password?</Text>
                      </Pressable>
                    </View>
                  )}

                  {activeMode === 'sign-up' && (
                    <View style={styles.footerContainer}>
                      <Text style={styles.footerText}>Already have an account? </Text>
                      <Pressable
                        style={styles.footerLink}
                        onPress={() => handleSwitchMode('sign-in')}
                      >
                        <Text style={styles.footerLinkText}>Log in</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}


