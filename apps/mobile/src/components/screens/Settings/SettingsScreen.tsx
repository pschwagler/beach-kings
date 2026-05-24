/**
 * SettingsScreen — single-screen settings menu.
 *
 * Sections:
 *   - Login & Security (Email, Password, Phone)
 *   - Connected Accounts (Google, Apple)
 *   - Notifications
 *   - Appearance (Theme)
 *   - Support (Feedback, Contact, Rate)
 *   - Danger Zone (Delete Account)
 *   - Log Out
 *
 * Wireframe ref: settings.html + settings-account.html (merged)
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { supportMailtoPhoneChange } from '@/lib/support';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { Player } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SettingsRowProps {
  readonly label: string;
  readonly value?: string;
  readonly valueColor?: string;
  readonly labelColor?: string;
  readonly rightElement?: React.ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
}

function SettingsRow({
  label,
  value,
  valueColor = 'text-muted',
  labelColor = 'text-default',
  rightElement,
  onPress,
  testID,
}: SettingsRowProps): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={label}
      className="flex-row items-center justify-between px-lg py-[14px] bg-surface border-b border-divider last:border-0 active:opacity-70"
    >
      <Text className={`text-[15px] ${labelColor}`}>{label}</Text>

      {rightElement != null ? (
        rightElement
      ) : (
        <View className="flex-row items-center gap-sm">
          {value != null && (
            <Text className={`text-[13px] ${valueColor}`}>{value}</Text>
          )}
          {onPress != null && (
            <Text className="text-muted text-lg">›</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

interface SectionLabelProps {
  readonly title: string;
  readonly danger?: boolean;
}

function SectionLabel({ title, danger = false }: SectionLabelProps): React.ReactNode {
  return (
    <Text
      className={`text-[15px] font-bold px-lg pt-xl pb-sm ${
        danger ? 'text-red-500' : 'text-default'
      }`}
    >
      {title}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function SettingsScreen(): React.ReactNode {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { themeMode } = useTheme();
  const hasPassword = user?.has_password !== false;
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

  const themeLabel =
    themeMode === 'light' ? 'Light' : themeMode === 'dark' ? 'Dark' : 'System';

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

  const handleNotifications = useCallback(() => {
    void hapticLight();
    router.push(routes.settingsNotifications());
  }, [router]);

  const handleAppearance = useCallback(() => {
    void hapticLight();
    router.push(routes.settingsAppearance());
  }, [router]);

  const handleFeedback = useCallback(() => {
    void hapticLight();
    router.push(routes.settingsFeedback());
  }, [router]);

  const handleContactSupport = useCallback(() => {
    void hapticLight();
    Alert.alert('Contact Support', 'Support form coming soon.');
  }, []);

  const handleRateApp = useCallback(() => {
    void hapticLight();
    Alert.alert('Rate Beach League', 'App Store rating coming soon.');
  }, []);

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
            Alert.alert('Account deletion coming soon.');
          },
        },
      ],
    );
  }, []);

  const handleLogout = useCallback(() => {
    void hapticMedium();
    setShowLogoutConfirm(true);
  }, []);

  const confirmLogout = useCallback(() => {
    setShowLogoutConfirm(false);
    void hapticMedium();
    logout();
  }, [logout]);

  return (
    <SafeAreaView
      testID="settings-screen"
      className="flex-1 bg-page"
      edges={['top']}
    >
      <TopNav title="Settings" showBack backFallback={routes.profile()} />

      <ScrollView className="flex-1">

        <SectionLabel title="Login & Security" />
        <View>
          <SettingsRow
            testID="settings-row-email"
            label="Email"
            value={maskedEmail}
          />
          {hasPassword && (
            <SettingsRow
              testID="settings-row-password"
              label="Password"
              value="Change"
              valueColor="text-brand-teal"
              onPress={handleChangePassword}
            />
          )}
          <SettingsRow
            testID="settings-row-phone"
            label="Phone Number"
            value={phone != null ? maskPhone(phone) : 'Not set'}
            valueColor={phone == null ? 'text-brand-teal' : undefined}
            onPress={handlePhonePress}
          />
        </View>

        <SectionLabel title="Connected Accounts" />
        <View>
          <SettingsRow
            testID="settings-row-google"
            label="Google"
            rightElement={
              <View className="flex-row items-center gap-sm">
                <View className="w-2 h-2 rounded-full bg-green-500" />
                <Text className="text-[14px] text-green-500">Connected</Text>
              </View>
            }
          />
          <SettingsRow
            testID="settings-row-apple"
            label="Apple"
            rightElement={
              <Pressable
                onPress={() => {
                  // TODO(backend): Apple sign-in connect
                }}
                accessibilityRole="button"
                className="px-md py-[6px] rounded-lg border-[1.5px] border-default active:opacity-70"
              >
                <Text className="text-[13px] font-semibold text-default">
                  Connect
                </Text>
              </Pressable>
            }
          />
        </View>

        <SectionLabel title="Notifications" />
        <View>
          <SettingsRow
            testID="settings-row-notifications"
            label="Notification Preferences"
            onPress={handleNotifications}
          />
        </View>

        <SectionLabel title="Appearance" />
        <View>
          <SettingsRow
            testID="settings-row-appearance"
            label="Theme"
            value={themeLabel}
            onPress={handleAppearance}
          />
        </View>

        <SectionLabel title="Support" />
        <View>
          <SettingsRow
            testID="settings-row-feedback"
            label="Leave Feedback"
            onPress={handleFeedback}
          />
          <SettingsRow
            testID="settings-row-contact"
            label="Contact Support"
            onPress={handleContactSupport}
          />
          <SettingsRow
            testID="settings-row-rate"
            label="Rate Beach League"
            onPress={handleRateApp}
          />
        </View>

        <SectionLabel title="Danger Zone" danger />
        <View>
          <SettingsRow
            testID="settings-row-delete"
            label="Delete Account"
            labelColor="text-red-500 font-semibold"
            valueColor="text-red-400"
            onPress={handleDeleteAccount}
          />
        </View>

        <Pressable
          testID="settings-logout-btn"
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Log Out"
          className="mx-lg my-xl py-[14px] rounded-xl border-[1.5px] border-red-500 items-center active:opacity-70"
        >
          <Text className="text-[15px] font-semibold text-red-500">Log Out</Text>
        </Pressable>

        <Text className="text-center text-[12px] text-muted pb-lg">
          Beach League v1.0.0
        </Text>

      </ScrollView>

      {showLogoutConfirm && (
        <LogoutModal
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local == null || domain == null) return email;
  const masked = local.charAt(0) + '***';
  return `${masked}@${domain}`;
}

function maskPhone(phone: string): string {
  if (phone.length < 4) return phone;
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
}

// ---------------------------------------------------------------------------
// Logout modal
// ---------------------------------------------------------------------------

interface LogoutModalProps {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function LogoutModal({ onConfirm, onCancel }: LogoutModalProps): React.ReactNode {
  return (
    <View
      testID="logout-modal"
      className="absolute inset-0 bg-black/50 items-center justify-center px-xl"
    >
      <View className="w-full bg-surface rounded-2xl p-xl">
        <Text className="text-[18px] font-bold text-default text-center mb-sm">
          Log Out?
        </Text>
        <Text className="text-sm text-muted text-center mb-lg">
          Are you sure you want to log out of Beach League?
        </Text>

        <Pressable
          testID="logout-confirm-btn"
          onPress={onConfirm}
          className="bg-red-500 py-sm rounded-xl mb-sm items-center active:opacity-70"
        >
          <Text className="text-white font-semibold">Log Out</Text>
        </Pressable>

        <Pressable
          testID="logout-cancel-btn"
          onPress={onCancel}
          className="py-sm rounded-xl items-center active:opacity-70"
        >
          <Text className="text-muted font-semibold">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
