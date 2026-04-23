/**
 * SettingsScreen — root settings menu.
 *
 * Renders:
 *   - Account section (Email, Password, Phone)
 *   - Notifications section
 *   - Support section (Feedback, Contact, Rate)
 *   - Danger Zone (Delete Account)
 *   - Log Out button with confirmation
 *
 * Wireframe ref: settings.html
 */

import React, { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SettingsRowProps {
  readonly label: string;
  readonly value?: string;
  readonly valueColor?: string;
  readonly labelColor?: string;
  readonly onPress?: () => void;
  readonly testID?: string;
}

function SettingsRow({
  label,
  value,
  valueColor = 'text-text-muted dark:text-text-tertiary',
  labelColor = 'text-text-default dark:text-content-primary',
  onPress,
  testID,
}: SettingsRowProps): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={label}
      className="flex-row items-center justify-between px-lg py-[14px] bg-white dark:bg-elevated border-b border-border dark:border-border-strong last:border-0 active:opacity-70"
    >
      <Text className={`text-[15px] ${labelColor}`}>{label}</Text>
      <View className="flex-row items-center gap-sm">
        {value != null && (
          <Text className={`text-[13px] ${valueColor}`}>{value}</Text>
        )}
        <Text className="text-text-disabled text-lg">›</Text>
      </View>
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
        danger ? 'text-red-500' : 'text-text-default dark:text-content-primary'
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
  const { logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleSettingsAccount = useCallback(() => {
    void hapticLight();
    router.push(routes.settingsAccount());
  }, [router]);

  const handleChangePassword = useCallback(() => {
    void hapticLight();
    router.push(routes.changePassword());
  }, [router]);

  const handleNotifications = useCallback(() => {
    void hapticLight();
    router.push(routes.settingsNotifications());
  }, [router]);

  const handleFeedback = useCallback(() => {
    void hapticLight();
    Alert.alert('Feedback', 'Feedback form coming soon.');
    // TODO(backend): open feedback form
  }, []);

  const handleContactSupport = useCallback(() => {
    void hapticLight();
    Alert.alert('Contact Support', 'Support form coming soon.');
    // TODO(backend): open support form
  }, []);

  const handleRateApp = useCallback(() => {
    void hapticLight();
    Alert.alert('Rate Beach League', 'App Store rating coming soon.');
    // TODO(backend): open app store
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
            // TODO(backend): DELETE /api/users/me
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
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Settings" showBack />

      <ScrollView className="flex-1">

        <SectionLabel title="Account" />
        <View>
          <SettingsRow
            testID="settings-row-email"
            label="Email"
            value="Account info"
            onPress={handleSettingsAccount}
          />
          <SettingsRow
            testID="settings-row-password"
            label="Password"
            value="Change"
            valueColor="text-brand-teal"
            onPress={handleChangePassword}
          />
          <SettingsRow
            testID="settings-row-phone"
            label="Phone Number"
            value="Not set"
            onPress={handleSettingsAccount}
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

        <Text className="text-center text-[12px] text-text-disabled pb-lg">
          Beach League v1.0.0
        </Text>

      </ScrollView>

      {/* Logout confirmation modal */}
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
      <View className="w-full bg-white dark:bg-elevated rounded-2xl p-xl">
        <Text className="text-[18px] font-bold text-text-default dark:text-content-primary text-center mb-sm">
          Log Out?
        </Text>
        <Text className="text-sm text-text-muted dark:text-text-tertiary text-center mb-lg">
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
          <Text className="text-text-muted dark:text-text-tertiary font-semibold">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
