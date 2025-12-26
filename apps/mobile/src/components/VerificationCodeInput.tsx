import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { useTamaguiTheme } from '../hooks/useTamaguiTheme';

interface VerificationCodeInputProps {
  value: string;
  onChange: (event: { target: { name: string; value: string } }) => void;
  onSendCode?: (() => void) | null;
  isSubmitting?: boolean;
  placeholder?: string;
}

export default function VerificationCodeInput({ 
  value, 
  onChange, 
  onSendCode = null, 
  isSubmitting = false,
  placeholder = '1234'
}: VerificationCodeInputProps) {
  const theme = useTamaguiTheme();
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (text: string) => {
    // Only allow digits, limit to 4 characters
    const digits = text.replace(/\D/g, '').slice(0, 4);
    onChange({
      target: {
        name: 'code',
        value: digits,
      },
    });
  };

  const styles = StyleSheet.create({
    container: {
      gap: theme.spacing.xs,
    },
    label: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: isFocused ? theme.colors.oceanBlue : theme.colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.semibold,
      textAlign: 'center',
      letterSpacing: 8,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.backgroundLight,
    },
    sendCodeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.oceanBlue,
      backgroundColor: 'transparent',
    },
    sendCodeButtonDisabled: {
      opacity: 0.5,
    },
    sendCodeButtonText: {
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.oceanBlue,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Verification Code</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textLight}
          keyboardType="number-pad"
          maxLength={4}
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
        />
        {onSendCode && (
          <Pressable
            style={[
              styles.sendCodeButton,
              isSubmitting && styles.sendCodeButtonDisabled,
            ]}
            onPress={onSendCode}
            disabled={isSubmitting}
          >
            <MessageCircle size={16} color={theme.colors.oceanBlue} />
            <Text style={styles.sendCodeButtonText}>Send Code</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}


