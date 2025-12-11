import React, { useState, useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, XStack, Button as TamaguiButton, ScrollView, useTheme, getTokens } from 'tamagui';
import { ChevronLeft, Check, AlertCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import PhoneInput from '../src/components/PhoneInput';
import { Input } from '../src/components/ui/Input';
import { Text } from '../src/components/ui/Text';

const getErrorMessage = (error: any) => 
  error.response?.data?.detail || error.message || 'Something went wrong';

export default function SignupScreen() {
  const router = useRouter();
  const { signup, sendVerificationCode, verifyPhone } = useAuth();
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
  
  const [formData, setFormData] = useState({
    phoneNumber: '',
    password: '',
    fullName: '',
    email: '',
  });
  const [phoneValidation, setPhoneValidation] = useState({ isValid: false, value: '', displayValue: '' });
  const [passwordRequirements, setPasswordRequirements] = useState({
    minLength: false,
    hasNumber: false,
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  
  const fullNameRef = useRef<any>(null);
  const passwordRef = useRef<any>(null);
  const emailRef = useRef<any>(null);

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

    if (name === 'password') {
      setPasswordRequirements(validatePassword(value));
    }
  };

  const handlePhoneValidation = (validation: { isValid: boolean; value: string; displayValue: string; error?: string }) => {
    setPhoneValidation(validation);
    if (validation.error) {
      setErrorMessage(validation.error);
    }
  };

  const handleSignup = async () => {
    setErrorMessage('');
    setStatusMessage('');

    if (!phoneValidation.isValid || !phoneValidation.value) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    if (!formData.fullName || !formData.fullName.trim()) {
      setErrorMessage('Full name is required');
      return;
    }

    const passwordValid = validatePassword(formData.password);
    if (!passwordValid.minLength || !passwordValid.hasNumber) {
      setErrorMessage('Password must be at least 8 characters long and include a number');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signup({
        phoneNumber: phoneValidation.value,
        password: formData.password,
        fullName: formData.fullName.trim(),
        email: formData.email || undefined,
      });
      
      setStatusMessage('Account created! Enter the verification code we just sent you.');
      setShowVerification(true);
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (!verificationCode || verificationCode.length !== 4) {
      setErrorMessage('Please enter a valid 4-digit verification code');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await verifyPhone(phoneValidation.value, verificationCode);
      // Navigate to home on success
      router.replace('/(tabs)/home');
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showVerification) {
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
                onPress={() => setShowVerification(false)}
                backgroundColor="$backgroundLight"
                color={colors.textPrimary}
                pressStyle={{ opacity: 0.7 }}
              />
              <Text fontSize={28} fontWeight="700" color={colors.textPrimary} flex={1}>
                Verify Phone
              </Text>
            </XStack>

          <ScrollView 
            style={{ flex: 1 }}
            contentContainerStyle={{ 
              padding: 20,
              paddingTop: 24,
              paddingBottom: 40,
            }}
            showsVerticalScrollIndicator={false}
          >
            <YStack gap="$md">
              {statusMessage && (
                <XStack
                  padding="$md"
                  backgroundColor="$successLight"
                  borderRadius="$md"
                  space="$sm"
                  alignItems="center"
                >
                  <Check size={18} color={tokens.color.success.val} />
                  <Text fontSize="$2" color={colors.success} flex={1}>
                    {statusMessage}
                  </Text>
                </XStack>
              )}

              {errorMessage && (
                <XStack
                  padding="$md"
                  backgroundColor="$dangerLight"
                  borderRadius="$md"
                  space="$sm"
                  alignItems="center"
                >
                  <AlertCircle size={18} color={tokens.color.danger.val} />
                  <Text fontSize="$2" color={colors.danger} flex={1}>
                    {errorMessage}
                  </Text>
                </XStack>
              )}

              <YStack gap="$xs">
                <Text fontSize="$2" fontWeight="600" color={colors.textPrimary}>
                  Verification Code
                </Text>
                <Input
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  placeholder="Enter 4-digit code"
                  keyboardType="number-pad"
                  maxLength={4}
                  returnKeyType="done"
                  onSubmitEditing={handleVerify}
                />
              </YStack>

              <TamaguiButton
                onPress={handleVerify}
                disabled={isSubmitting || !verificationCode || verificationCode.length !== 4}
                backgroundColor="$oceanBlue"
                color={colors.textWhite}
                fontSize="$3"
                fontWeight="600"
                paddingVertical="$md"
                paddingHorizontal="$lg"
                marginTop="$md"
                opacity={isSubmitting ? 0.6 : 1}
              >
                {isSubmitting ? 'Verifying...' : 'Verify'}
              </TamaguiButton>
            </YStack>
          </ScrollView>
        </YStack>
      </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

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
              onPress={() => router.back()}
              backgroundColor="$backgroundLight"
              color={colors.textPrimary}
              pressStyle={{ opacity: 0.7 }}
            />
            <Text fontSize={28} fontWeight="700" color={colors.textPrimary} flex={1}>
              Create Account
            </Text>
          </XStack>

        <ScrollView 
          flex={1}
          padding="$lg"
          paddingTop="$xl"
          paddingBottom={150}
          showsVerticalScrollIndicator={false}
        >
          <YStack space="$lg" paddingBottom={80}>
            {errorMessage && (
              <XStack
                padding="$md"
                backgroundColor="$dangerLight"
                borderRadius="$md"
                space="$sm"
                alignItems="center"
                marginBottom="$xs"
              >
                <AlertCircle size={18} color={colors.danger} />
                <Text fontSize="$2" color={colors.danger} flex={1}>
                  {errorMessage}
                </Text>
              </XStack>
            )}

            <YStack space="$sm">
              <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                Full Name <Text color={colors.danger}>*</Text>
              </Text>
              <Input
                ref={fullNameRef}
                value={formData.fullName}
                onChangeText={(text) => handleInputChange('fullName', text)}
                placeholder="John Doe"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </YStack>

            <YStack space="$sm" marginTop="$md">
              <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                Phone Number <Text color={colors.danger}>*</Text>
              </Text>
              <PhoneInput
                value={formData.phoneNumber}
                onChange={(value) => setFormData(prev => ({ ...prev, phoneNumber: value }))}
                onValidationChange={handlePhoneValidation}
                required
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </YStack>

            <YStack space="$sm" marginTop={-8}>
              <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                Password <Text color={colors.danger}>*</Text>
              </Text>
              <Input
                ref={passwordRef}
                value={formData.password}
                onChangeText={(text) => handleInputChange('password', text)}
                secureTextEntry
                placeholder=""
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
              <YStack space="$sm">
                <XStack space="$sm" alignItems="center">
                  {passwordRequirements.minLength ? (
                    <Check size={14} color={tokens.color.successDark.val} />
                  ) : (
                    <AlertCircle size={14} color={tokens.color.gray600.val} />
                  )}
                  <Text fontSize={14} color={passwordRequirements.minLength ? tokens.color.successDark.val : colors.textSecondary}>
                    At least 8 characters
                  </Text>
                </XStack>
                <XStack space="$sm" alignItems="center">
                  {passwordRequirements.hasNumber ? (
                    <Check size={14} color={tokens.color.successDark.val} />
                  ) : (
                    <AlertCircle size={14} color={tokens.color.gray600.val} />
                  )}
                  <Text fontSize={14} color={passwordRequirements.hasNumber ? tokens.color.successDark.val : colors.textSecondary}>
                    Includes a number
                  </Text>
                </XStack>
              </YStack>
            </YStack>

            <YStack space="$sm" marginTop="$md">
              <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                Email
              </Text>
              <Input
                ref={emailRef}
                value={formData.email}
                onChangeText={(text) => handleInputChange('email', text)}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="Optional"
                returnKeyType="done"
                onSubmitEditing={handleSignup}
              />
            </YStack>

            <YStack space="$md" marginTop="$lg">
              <TamaguiButton
                onPress={handleSignup}
                disabled={isSubmitting || !phoneValidation.isValid || !formData.fullName.trim() || !passwordRequirements.minLength || !passwordRequirements.hasNumber}
                backgroundColor="$mutedRed"
                color="$textWhite"
                fontSize="$3"
                fontWeight="700"
                minHeight={48}
                borderRadius={12}
                opacity={isSubmitting ? 0.7 : 1}
                pressStyle={{ opacity: 0.8 }}
              >
                {isSubmitting ? 'Creating Account...' : 'Create Account'}
              </TamaguiButton>

              <YStack space={0} marginTop="$md" alignItems="center" paddingHorizontal="$md">
                <Text fontSize={12} color={colors.textSecondary} textAlign="center" lineHeight={16.8}>
                  By providing your phone number, you agree to receive a one-time verification code from Beach League. Message and data rates may apply. Message frequency varies. Reply HELP for help or STOP to cancel. By continuing, you agree to our{' '}
                  <Text 
                    fontSize={12} 
                    color="$primary" 
                    textDecorationLine="underline"
                    onPress={() => Linking.openURL('https://beachleaguevb.com/terms-of-service')}
                  >
                    Terms of Service
                  </Text>
                  {' '}and have read our{' '}
                  <Text 
                    fontSize={12} 
                    color="$primary" 
                    textDecorationLine="underline"
                    onPress={() => Linking.openURL('https://beachleaguevb.com/privacy-policy')}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </YStack>

              <XStack space="$xs" justifyContent="center" alignItems="center" flexWrap="wrap" marginTop="$sm" marginBottom={60}>
                <Text fontSize={14.4} color={colors.textSecondary}>
                  Already have an account?{' '}
                </Text>
                <TamaguiButton
                  onPress={() => router.push('/login')}
                  backgroundColor="transparent"
                  color="$primary"
                  fontSize={14.4}
                  fontWeight="600"
                  minHeight={24}
                  padding={0}
                  pressStyle={{ opacity: 0.7 }}
                >
                  Log in
                </TamaguiButton>
              </XStack>
            </YStack>
          </YStack>
        </ScrollView>
      </YStack>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
