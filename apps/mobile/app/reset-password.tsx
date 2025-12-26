import React, { useState, useRef } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, XStack, Button as TamaguiButton, useTheme, getTokens } from 'tamagui';
import { ChevronLeft, AlertCircle, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import PhoneInput from '../src/components/PhoneInput';
import { Input } from '../src/components/ui/Input';
import { Text } from '../src/components/ui/Text';

const getErrorMessage = (error: any) => 
  error.response?.data?.detail || error.message || 'Something went wrong';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { resetPassword, verifyPasswordReset, confirmPasswordReset } = useAuth();
  const theme = useTheme();
  const tokens = getTokens();
  
  // Get token values for colors
  const colors = {
    textPrimary: tokens.color.textPrimary.val,
    textSecondary: tokens.color.textSecondary.val,
    textWhite: tokens.color.textWhite.val,
    danger: tokens.color.danger.val,
    success: tokens.color.success.val,
  };
  
  const [step, setStep] = useState<'phone' | 'code' | 'new-password'>('phone');
  const [formData, setFormData] = useState({
    phoneNumber: '',
    code: '',
    password: '',
  });
  const [phoneValidation, setPhoneValidation] = useState({ isValid: false, value: '', displayValue: '' });
  const [passwordRequirements, setPasswordRequirements] = useState({
    minLength: false,
    hasNumber: false,
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  
  const codeRef = useRef<any>(null);
  const passwordRef = useRef<any>(null);

  const validatePassword = (password: string) => {
    return {
      minLength: password.length >= 8,
      hasNumber: /\d/.test(password),
    };
  };

  const handlePhoneValidation = (validation: { isValid: boolean; value: string; displayValue: string; error?: string }) => {
    setPhoneValidation(validation);
    if (validation.error) {
      setErrorMessage(validation.error);
    }
  };

  const handleSendCode = async () => {
    setErrorMessage('');
    setStatusMessage('');

    if (!phoneValidation.isValid || !phoneValidation.value) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword(phoneValidation.value);
      setStatusMessage('Verification code sent! Please check your SMS messages.');
      setStep('code');
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!formData.code || formData.code.length !== 4) {
      setErrorMessage('Please enter a valid 4-digit verification code');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const result = await verifyPasswordReset(phoneValidation.value, formData.code);
      setResetToken(result.reset_token);
      setStep('new-password');
      setErrorMessage('');
      setStatusMessage('');
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    const passwordValid = validatePassword(formData.password);
    if (!passwordValid.minLength || !passwordValid.hasNumber) {
      setErrorMessage('Password must be at least 8 characters long and include a number');
      return;
    }

    if (!resetToken) {
      setErrorMessage('Reset token is missing. Please start over.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await confirmPasswordReset(resetToken, formData.password);
      // Navigate to login on success
      router.replace('/login');
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordChange = (password: string) => {
    setFormData(prev => ({ ...prev, password }));
    setPasswordRequirements(validatePassword(password));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f4e4c1' }}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <YStack flex={1} backgroundColor="$sand">
          {/* Header with back button */}
          <XStack
            padding="$4"
            paddingTop="$2"
            paddingBottom="$3"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderLight"
            backgroundColor="$background"
            minHeight={60}
          >
            <TamaguiButton
              size="$4"
              circular
              icon={ChevronLeft}
              onPress={() => {
                if (step === 'phone') {
                  router.back();
                } else {
                  setStep(step === 'code' ? 'phone' : 'code');
                  setErrorMessage('');
                  setStatusMessage('');
                }
              }}
              backgroundColor="$backgroundLight"
              color={colors.textPrimary}
              pressStyle={{ opacity: 0.7 }}
            />
            <Text fontSize={28} fontWeight="700" color={colors.textPrimary} flex={1}>
              {step === 'phone' ? 'Reset Password' : step === 'code' ? 'Enter Code' : 'New Password'}
            </Text>
          </XStack>

        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={{ 
            padding: 20,
            paddingBottom: 40,
          }}
        >
          <YStack gap="$4">
            {statusMessage && (
              <XStack
                padding="$3"
                backgroundColor="$successLight"
                borderRadius="$3"
                gap="$2"
                alignItems="center"
              >
                <Check size={18} color={tokens.color.success.val} />
                <Text fontSize={16} color={colors.success} flex={1}>
                  {statusMessage}
                </Text>
              </XStack>
            )}

            {errorMessage && (
              <XStack
                padding="$3"
                backgroundColor="$dangerLight"
                borderRadius="$3"
                gap="$2"
                alignItems="center"
              >
                <AlertCircle size={18} color={tokens.color.danger.val} />
                <Text fontSize={16} color={colors.danger} flex={1}>
                  {errorMessage}
                </Text>
              </XStack>
            )}

            {step === 'phone' && (
              <>
                <YStack gap="$2">
                  <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                    Phone Number <Text color={colors.danger}>*</Text>
                  </Text>
                  <PhoneInput
                    value={formData.phoneNumber}
                    onChange={(value) => setFormData(prev => ({ ...prev, phoneNumber: value }))}
                    onValidationChange={handlePhoneValidation}
                    required
                    returnKeyType="done"
                    onSubmitEditing={handleSendCode}
                  />
                </YStack>

                <TamaguiButton
                  onPress={handleSendCode}
                  disabled={isSubmitting || !phoneValidation.isValid}
                  backgroundColor="$oceanBlue"
                  color="$textWhite"
                  fontSize={18}
                  fontWeight="600"
                  padding="$4"
                  opacity={isSubmitting ? 0.6 : 1}
                  marginTop="$2"
                >
                  {isSubmitting ? 'Sending...' : 'Send Code'}
                </TamaguiButton>
              </>
            )}

            {step === 'code' && (
              <>
                <YStack gap="$2">
                  <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                    Verification Code <Text color={colors.danger}>*</Text>
                  </Text>
                  <Input
                    ref={codeRef}
                    value={formData.code}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, code: text }))}
                    placeholder="Enter 4-digit code"
                    keyboardType="number-pad"
                    maxLength={4}
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyCode}
                  />
                </YStack>

                <TamaguiButton
                  onPress={handleVerifyCode}
                  disabled={isSubmitting || !formData.code || formData.code.length !== 4}
                  backgroundColor="$oceanBlue"
                  color="$textWhite"
                  fontSize={18}
                  fontWeight="600"
                  padding="$4"
                  opacity={isSubmitting ? 0.6 : 1}
                  marginTop="$2"
                >
                  {isSubmitting ? 'Verifying...' : 'Verify Code'}
                </TamaguiButton>
              </>
            )}

            {step === 'new-password' && (
              <>
                <YStack gap="$2">
                  <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                    New Password <Text color={colors.danger}>*</Text>
                  </Text>
                  <Input
                    ref={passwordRef}
                    value={formData.password}
                    onChangeText={handlePasswordChange}
                    secureTextEntry
                    placeholder=""
                    returnKeyType="done"
                    onSubmitEditing={handleResetPassword}
                  />
                  <YStack gap="$1" marginTop="$1">
                    <XStack gap="$2" alignItems="center">
                      {passwordRequirements.minLength ? (
                        <Check size={14} color={tokens.color.success.val} />
                      ) : (
                        <AlertCircle size={14} color={tokens.color.textLight.val} />
                      )}
                      <Text fontSize={14} color={colors.textSecondary}>
                        At least 8 characters
                      </Text>
                    </XStack>
                    <XStack gap="$2" alignItems="center">
                      {passwordRequirements.hasNumber ? (
                        <Check size={14} color={tokens.color.success.val} />
                      ) : (
                        <AlertCircle size={14} color={tokens.color.textLight.val} />
                      )}
                      <Text fontSize={14} color={colors.textSecondary}>
                        Includes a number
                      </Text>
                    </XStack>
                  </YStack>
                </YStack>

                <TamaguiButton
                  onPress={handleResetPassword}
                  disabled={isSubmitting || !passwordRequirements.minLength || !passwordRequirements.hasNumber}
                  backgroundColor="$oceanBlue"
                  color="$textWhite"
                  fontSize={18}
                  fontWeight="600"
                  padding="$4"
                  opacity={isSubmitting ? 0.6 : 1}
                  marginTop="$2"
                >
                  {isSubmitting ? 'Resetting...' : 'Reset Password'}
                </TamaguiButton>
              </>
            )}
          </YStack>
        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


