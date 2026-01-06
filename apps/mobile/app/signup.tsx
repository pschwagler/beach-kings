import React, { useState, useRef, useEffect } from 'react';
import { KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, XStack, Button as TamaguiButton, ScrollView, useTheme, getTokens } from 'tamagui';
import { Check, AlertCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import PhoneInput from '../src/components/PhoneInput';
import { Input } from '../src/components/ui/Input';
import { Text } from '../src/components/ui/Text';
import { Header } from '../src/components/ui/Header';

const getErrorMessage = (error: any) => 
  error.response?.data?.detail || error.message || 'Something went wrong';

export default function SignupScreen() {
  const router = useRouter();
  const { signup, sendVerificationCode, verifyPhone } = useAuth();
  const theme = useTheme();
  const tokens = getTokens();
  
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
  const phoneRef = useRef<any>(null);
  const passwordRef = useRef<any>(null);
  const emailRef = useRef<any>(null);
  const scrollViewRef = useRef<any>(null);
  const verificationScrollViewRef = useRef<any>(null);

  // Scroll to top when error message appears
  useEffect(() => {
    if (errorMessage) {
      // Use setTimeout to ensure the error message is rendered before scrolling
      const timer = setTimeout(() => {
        if (showVerification && verificationScrollViewRef.current) {
          verificationScrollViewRef.current.scrollTo({ y: 0, animated: true });
        } else if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ y: 0, animated: true });
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [errorMessage, showVerification]);

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
    // Don't set error messages here - let form submission handle errors
    // The PhoneInput component will show its own inline validation errors
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
    if (!passwordValid) {
      if (!passwordValid.minLength && !passwordValid.hasNumber) {
        setErrorMessage('Password must be at least 8 characters long and include a number');
        return;
      } else if (!passwordValid.minLength) {
        setErrorMessage('Password must be at least 8 characters long');
        return;
      } else if (!passwordValid.hasNumber) {
        setErrorMessage('Password must include a number');
        return;
      }
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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.white.val }}>
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <YStack flex={1} backgroundColor="$white">
            <Header onBack={() => setShowVerification(false)} />

          <ScrollView 
            ref={verificationScrollViewRef}
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
                  <Check size={18} color={theme.success.val} />
                  <Text fontSize="$2" color="$success" flex={1}>
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
                  <AlertCircle size={18} color={theme.danger.val} />
                  <Text fontSize="$2" color="$danger" flex={1}>
                    {errorMessage}
                  </Text>
                </XStack>
              )}

              <YStack gap="$xs">
                <Text fontSize="$2" fontWeight="600" color="$textPrimary">
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

              <YStack space="$md" marginTop="$lg">
              <TamaguiButton
                onPress={handleVerify}
                disabled={isSubmitting || !verificationCode || verificationCode.length !== 4}
                backgroundColor="$oceanBlue"
                color="$textWhite"
                fontSize="$3"
                fontWeight="600"
                minHeight={48}
                borderRadius={12}
                opacity={isSubmitting ? 0.7 : 1}
                pressStyle={{ opacity: 0.8 }}
              >
                {isSubmitting ? 'Verifying...' : 'Verify'}
              </TamaguiButton>
              </YStack>
            </YStack>
          </ScrollView>
        </YStack>
      </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.white.val }}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <YStack flex={1} backgroundColor="$white">
          <Header onBack={() => router.back()} />

        <ScrollView 
          ref={scrollViewRef}
          flex={1}
          padding="$lg"
          paddingTop="$md"
          paddingBottom={150}
          showsVerticalScrollIndicator={false}
        >
          <YStack gap="$lg" paddingBottom={80} marginTop="$md">
            <Text fontSize={22} fontWeight="700" color="$textPrimary" marginBottom="$xs">
              Create your account
            </Text>
            {errorMessage && (
              <XStack
                padding="$md"
                backgroundColor="$dangerLight"
                borderRadius="$md"
                gap="$sm"
                alignItems="center"
                marginBottom="$xs"
              >
                <AlertCircle size={18} color={theme.danger.val} />
                <Text fontSize="$2" color={colors.danger} flex={1}>
                  {errorMessage}
                </Text>
              </XStack>
            )}

            <YStack gap="$xs">
              <Text fontSize={14} fontWeight="600" color="$textPrimary">
                Full Name <Text color="$danger">*</Text>
              </Text>
              <Input
                ref={fullNameRef}
                value={formData.fullName}
                onChangeText={(text) => handleInputChange('fullName', text)}
                placeholder="John Doe"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                autoCapitalize="words"
              />
            </YStack>

            <YStack gap="$xs" marginTop="$md">
              <Text fontSize={14} fontWeight="600" color="$textPrimary">
                Phone Number <Text color="$danger">*</Text>
              </Text>
              <PhoneInput
                ref={phoneRef}
                value={formData.phoneNumber}
                onChange={(value) => setFormData(prev => ({ ...prev, phoneNumber: value }))}
                onValidationChange={handlePhoneValidation}
                required
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </YStack>

            <YStack gap="$xs">
              <Text fontSize={14} fontWeight="600" color="$textPrimary">
                Password <Text color="$danger">*</Text>
              </Text>
              <Input
                ref={passwordRef}
                value={formData.password}
                onChangeText={(text) => handleInputChange('password', text)}
                secureTextEntry
                placeholder=""
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                size={"$2"}
              />
              <YStack space="$sm">
                <XStack space="$sm" alignItems="center">
                  {passwordRequirements.minLength ? (
                    <Check size={14} color={theme.successDark.val} />
                  ) : (
                    <AlertCircle size={14} color={theme.gray600.val} />
                  )}
                  <Text fontSize={14} color={passwordRequirements.minLength ? theme.successDark.val : '$textSecondary'}>
                    At least 8 characters
                  </Text>
                </XStack>
                <XStack space="$sm" alignItems="center">
                  {passwordRequirements.hasNumber ? (
                    <Check size={14} color={theme.successDark.val} />
                  ) : (
                    <AlertCircle size={14} color={theme.gray600.val} />
                  )}
                  <Text fontSize={14} color={passwordRequirements.hasNumber ? theme.successDark.val : '$textSecondary'}>
                    Includes a number
                  </Text>
                </XStack>
              </YStack>
            </YStack>

            <YStack space="$sm" marginTop="$md">
              <Text fontSize={15} fontWeight="600" color="$textPrimary">
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
                disabled={isSubmitting}
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
                <Text fontSize={12} color="$textSecondary" textAlign="center" lineHeight={16.8}>
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
                <Text fontSize={14.4} color="$textSecondary">
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


