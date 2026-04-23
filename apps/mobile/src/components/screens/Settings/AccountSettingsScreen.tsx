/**
 * AccountSettingsScreen — Login & Security, Connected Accounts, Privacy, Danger Zone.
 *
 * Sections:
 *   - Login & Security: Email, Password (→ Change Password), Phone
 *   - Connected Accounts: Google, Apple (static for now)
 *   - Privacy: Profile Visibility, Game History (TODO: pickers)
 *   - Danger Zone: Delete Account
 *
 * Wireframe ref: settings-account.html
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { supportMailtoPhoneChange } from '@/lib/support';
import { useAuth } from '@/contexts/AuthContext';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { Player } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  readonly title: string;
  readonly danger?: boolean;
}

function SectionHeader({ title, danger = false }: SectionHeaderProps): React.ReactNode {
  return (
    <Text
      className={`text-[12px] font-bold uppercase tracking-wider px-lg pt-xl pb-sm ${
        danger ? 'text-red-500' : 'text-text-muted dark:text-text-tertiary'
      }`}
    >
      {title}
    </Text>
  );
}

interface AccountRowProps {
  readonly label: string;
  readonly value?: string;
  readonly valueColor?: string;
  readonly labelColor?: string;
  readonly rightElement?: React.ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
}

function AccountRow({
  label,
  value,
  valueColor = 'text-text-muted dark:text-text-tertiary',
  labelColor = 'text-text-default dark:text-content-primary',
  rightElement,
  onPress,
  testID,
}: AccountRowProps): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={label}
      className="flex-row items-center justify-between px-lg bg-white dark:bg-elevated border-b border-border dark:border-border-strong min-h-[48px] active:opacity-70"
    >
      <Text className={`text-[15px] ${labelColor}`}>{label}</Text>

      {rightElement != null ? (
        rightElement
      ) : (
        <View className="flex-row items-center gap-sm">
          {value != null && (
            <Text className={`text-[14px] ${valueColor}`}>{value}</Text>
          )}
          {onPress != null && (
            <Text className="text-text-disabled text-lg">›</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AccountSettingsScreen(): React.ReactNode {
  const router = useRouter();
  const { user } = useAuth();

  const { data: player } = useApi<Player>(
    () => api.getCurrentUserPlayer(),
    [],
  );

  const maskedEmail =
    user?.email != null ? maskEmail(user.email) : 'Not set';

  const phone =
    (player as { phone_number?: string } | undefined)?.phone_number ??
    (user as { phone_number?: string } | undefined)?.phone_number ??
    null;

  const handleChangePassword = useCallback(() => {
    void hapticLight();
    router.push(routes.changePassword());
  }, [router]);

  const handlePhonePress = useCallback(() => {
    void hapticLight();
    if (phone != null) {
      void Linking.openURL(supportMailtoPhoneChange());
      return;
    }
    router.push(routes.settingsPhone());
  }, [phone, router]);

  const handleDeleteAccount = useCallback(() => {
    void hapticMedium();
    Alert.alert(
      'Delete Account?',
      'This will permanently delete your account, game history, and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            // TODO(backend): DELETE /api/users/me
            Alert.alert('Account deletion coming soon.');
          },
        },
      ],
    );
  }, []);

  return (
    <SafeAreaView
      testID="account-settings-screen"
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Account" showBack />

      <ScrollView className="flex-1">

        <SectionHeader title="Login & Security" />
        <View>
          <AccountRow
            testID="account-row-email"
            label="Email"
            value={maskedEmail}
          />
          <AccountRow
            testID="account-row-password"
            label="Password"
            value="Change"
            valueColor="text-brand-teal"
            onPress={handleChangePassword}
          />
          <AccountRow
            testID="account-row-phone"
            label="Phone Number"
            value={phone != null ? maskPhone(phone) : 'Not set'}
            valueColor={phone == null ? 'text-brand-teal' : undefined}
            onPress={handlePhonePress}
          />
        </View>

        <SectionHeader title="Connected Accounts" />
        <View>
          <AccountRow
            testID="account-row-google"
            label="Google"
            rightElement={
              <View className="flex-row items-center gap-sm">
                <View className="w-2 h-2 rounded-full bg-green-500" />
                <Text className="text-[14px] text-green-500">Connected</Text>
              </View>
            }
          />
          <AccountRow
            testID="account-row-apple"
            label="Apple"
            rightElement={
              <Pressable
                onPress={() => {
                  // TODO(backend): Apple sign-in connect
                }}
                accessibilityRole="button"
                className="px-md py-[6px] rounded-lg border-[1.5px] border-navy dark:border-content-primary active:opacity-70"
              >
                <Text className="text-[13px] font-semibold text-navy dark:text-content-primary">
                  Connect
                </Text>
              </Pressable>
            }
          />
        </View>

        <SectionHeader title="Privacy" />
        <View>
          <AccountRow
            testID="account-row-visibility"
            label="Profile Visibility"
            value="Everyone"
            onPress={() => {
              // TODO(backend): profile visibility picker
            }}
          />
          <AccountRow
            testID="account-row-game-history"
            label="Game History"
            value="Friends Only"
            onPress={() => {
              // TODO(backend): game history visibility picker
            }}
          />
        </View>

        <SectionHeader title="Danger Zone" danger />
        <View>
          <AccountRow
            testID="account-row-delete"
            label="Delete Account"
            labelColor="text-red-500 font-semibold"
            rightElement={
              <Text className="text-red-400 text-lg">›</Text>
            }
            onPress={handleDeleteAccount}
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "patrick@gmail.com" → "p***@gmail.com" */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local == null || domain == null) return email;
  const masked = local.charAt(0) + '***';
  return `${masked}@${domain}`;
}

/** "+1 (555) 123-4567" → "+1 (555) ***-4567" */
function maskPhone(phone: string): string {
  if (phone.length < 4) return phone;
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
}
