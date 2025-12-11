import React, { useState, useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, XStack, Button as TamaguiButton, ScrollView, useTheme, getTokens } from 'tamagui';
import { ChevronLeft, AlertCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import PhoneInput from '../src/components/PhoneInput';
import { Input } from '../src/components/ui/Input';
import { Text } from '../src/components/ui/Text';

const getErrorMessage = (error: any) => 
  error.response?.data?.detail || error.message || 'Something went wrong';

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithPassword } = useAuth();
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
  });
  const [phoneValidation, setPhoneValidation] = useState({ isValid: false, value: '', displayValue: '' });
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const passwordRef = useRef<any>(null);

  const handlePhoneValidation = (validation: { isValid: boolean; value: string; displayValue: string; error?: string }) => {
    setPhoneValidation(validation);
    if (validation.error) {
      setErrorMessage(validation.error);
    }
  };

  const handleLogin = async () => {
    setErrorMessage('');

    if (!phoneValidation.isValid || !phoneValidation.value) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    if (!formData.password) {
      setErrorMessage('Password is required');
      return;
    }

    setIsSubmitting(true);

    try {
      await loginWithPassword(phoneValidation.value, formData.password);
      // Navigate to home on success
      router.replace('/(tabs)/home');
    } catch (error: any) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
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
              onPress={() => router.back()}
              backgroundColor="$backgroundLight"
              color={colors.textPrimary}
              pressStyle={{ opacity: 0.7 }}
            />
            <Text fontSize={28} fontWeight="700" color={colors.textPrimary} flex={1}>
              Log In
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

            <YStack space="$sm" marginTop="$md">
              <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                Password <Text color={colors.danger}>*</Text>
              </Text>
              <Input
                ref={passwordRef}
                value={formData.password}
                onChangeText={(text) => setFormData(prev => ({ ...prev, password: text }))}
                secureTextEntry
                placeholder=""
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </YStack>

            <YStack space="$md" marginTop="$lg">
              <TamaguiButton
                onPress={handleLogin}
                disabled={isSubmitting || !phoneValidation.isValid || !formData.password}
                backgroundColor="$mutedRed"
                color="$textWhite"
                fontSize="$3"
                fontWeight="700"
                minHeight={48}
                borderRadius={12}
                opacity={isSubmitting ? 0.7 : 1}
                pressStyle={{ opacity: 0.8 }}
              >
                {isSubmitting ? 'Logging in...' : 'Log In'}
              </TamaguiButton>

              <YStack space={0} marginTop="$md" alignItems="center" paddingHorizontal="$md">
                <Text fontSize={12} color={colors.textSecondary} textAlign="center" lineHeight={16.8}>
                  By continuing, you agree to our{' '}
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
                  Don't have an account?{' '}
                </Text>
                <TamaguiButton
                  onPress={() => router.push('/signup')}
                  backgroundColor="transparent"
                  color="$primary"
                  fontSize={14.4}
                  fontWeight="600"
                  minHeight={24}
                  padding={0}
                  pressStyle={{ opacity: 0.7 }}
                >
                  Sign up
                </TamaguiButton>
                <Text fontSize={14.4} color={colors.textSecondary}>
                  {' '}•{' '}
                </Text>
                <TamaguiButton
                  onPress={() => router.push('/reset-password')}
                  backgroundColor="transparent"
                  color="$primary"
                  fontSize={14.4}
                  fontWeight="600"
                  minHeight={24}
                  padding={0}
                  pressStyle={{ opacity: 0.7 }}
                >
                  Forgot password?
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
