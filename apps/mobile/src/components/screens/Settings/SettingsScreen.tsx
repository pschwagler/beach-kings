/**
 * SettingsScreen — single-screen settings menu.
 *
 * Sections:
 *   - Login & Security (Email, Password, Phone)
 *   - Connected Accounts (Google, Apple)
 *   - Privacy
 *   - Notifications
 *   - Appearance (Theme)
 *   - Support (Feedback, Contact, Rate)
 *   - Log Out
 *   - Danger Zone (Delete Account)
 *
 * Wireframe ref: settings.html + settings-account.html (merged)
 */

import React, { useCallback, useState } from 'react';
import AppText from '@/components/ui/AppText';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import {
  openSupportMailto,
  supportMailtoPhoneChange,
} from '@/lib/support';
import { PUBLIC_URLS } from '@/lib/publicUrls';
import { openPublicWebUrl } from '@/lib/externalUrls';
import { requestAppRating } from './rateApp';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePaletteColors } from '@/theme/usePaletteColors';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { Player } from '@beach-kings/shared';
import { useConnectedAccounts } from './useConnectedAccounts';
import DeleteAccountDialog from './DeleteAccountDialog';

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
      <AppText className={`text-[15px] ${labelColor}`}>{label}</AppText>

      {rightElement != null ? (
        rightElement
      ) : (
        <View className="flex-row items-center gap-sm">
          {value != null && (
            <AppText className={`text-[13px] ${valueColor}`}>{value}</AppText>
          )}
          {onPress != null && (
            <AppText className="text-muted text-lg">›</AppText>
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
    <AppText
      className={`text-[15px] font-bold px-lg pt-xl pb-sm ${
        danger ? 'text-danger' : 'text-default'
      }`}
    >
      {title}
    </AppText>
  );
}

// ---------------------------------------------------------------------------
// Connected Account row right-element helpers
// ---------------------------------------------------------------------------

function ConnectedBadge(): React.ReactNode {
  return (
    <View className="flex-row items-center gap-sm">
      <View className="w-2 h-2 rounded-full bg-success-fill" />
      <AppText className="text-[14px] text-success">Connected</AppText>
    </View>
  );
}

interface ConnectButtonProps {
  readonly onPress: () => void;
  readonly loading?: boolean;
  readonly testID?: string;
}

function ConnectButton({ onPress, loading = false, testID }: ConnectButtonProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-touch px-md rounded-lg border-[1.5px] border-default items-center justify-center active:opacity-70"
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.textDefault} />
      ) : (
        <AppText className="text-[13px] font-semibold text-default">Connect</AppText>
      )}
    </Pressable>
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    appleAvailable,
    isLinkingGoogle,
    isLinkingApple,
    handleConnectGoogle,
    handleConnectApple,
  } = useConnectedAccounts();

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

  const googleConnected = user?.google_connected ?? false;
  const appleConnected = user?.apple_connected ?? false;
  const showAppleRow = Platform.OS === 'ios' && (appleAvailable || appleConnected);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleChangePassword = useCallback(() => {
    void hapticLight();
    router.push(routes.changePassword());
  }, [router]);

  const handlePhonePress = useCallback(() => {
    void hapticLight();
    if (phone != null) {
      void openSupportMailto(supportMailtoPhoneChange());
      return;
    }
    router.push(routes.settingsPhone());
  }, [phone, router]);

  const handlePrivacy = useCallback(() => {
    void hapticLight();
    router.push(routes.settingsPrivacy());
  }, [router]);

  const handleBlocked = useCallback(() => {
    void hapticLight();
    router.push(routes.settingsBlocked());
  }, [router]);

  const handleAccountStatus = useCallback(() => {
    void hapticLight();
    router.push(routes.settingsAccountStatus());
  }, [router]);

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
    router.push(routes.settingsSupport());
  }, [router]);

  const handleTerms = useCallback(() => {
    void hapticLight();
    void openPublicWebUrl(PUBLIC_URLS.terms);
  }, []);

  const handlePrivacyPolicy = useCallback(() => {
    void hapticLight();
    void openPublicWebUrl(PUBLIC_URLS.privacy);
  }, []);

  const handleCommunityGuidelines = useCallback(() => {
    void hapticLight();
    void openPublicWebUrl(PUBLIC_URLS.communityGuidelines);
  }, []);

  const handleRateApp = useCallback(() => {
    void hapticLight();
    void requestAppRating();
  }, []);

  const handleDeleteAccount = useCallback(() => {
    void hapticMedium();
    setDeleteError(null);
    setShowDeleteConfirm(true);
  }, []);

  const scheduleAccountDeletion = useCallback(() => {
    setDeleteError(null);
    setIsDeletingAccount(true);
    void api.scheduleAccountDeletion()
      .then(() => { void logout(); })
      .catch(() => {
        setDeleteError('Could not schedule account deletion. Please try again.');
      })
      .finally(() => {
        setIsDeletingAccount(false);
      });
  }, [logout]);

  const deleteAccountNow = useCallback(() => {
    setDeleteError(null);
    setIsDeletingAccount(true);
    void api.deleteAccountNow()
      .then(() => { void logout(); })
      .catch(() => {
        setDeleteError('Could not delete your account. Please try again.');
      })
      .finally(() => {
        setIsDeletingAccount(false);
      });
  }, [logout]);

  const handleLogout = useCallback(() => {
    void hapticMedium();
    setShowLogoutConfirm(true);
  }, []);

  const confirmLogout = useCallback(() => {
    setShowLogoutConfirm(false);
    void hapticMedium();
    void logout();
  }, [logout]);

  return (
    <SafeAreaView
      testID="settings-screen"
      className="flex-1 bg-page"
      edges={['top']}
    >
      <TopNav title="Settings" showBack />

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
              googleConnected ? (
                <ConnectedBadge />
              ) : (
                <ConnectButton
                  testID="settings-connect-google-btn"
                  onPress={() => { void hapticLight(); void handleConnectGoogle(); }}
                  loading={isLinkingGoogle}
                />
              )
            }
          />
          {showAppleRow && (
            <SettingsRow
              testID="settings-row-apple"
              label="Apple"
              rightElement={
                appleConnected ? (
                  <ConnectedBadge />
                ) : (
                  <ConnectButton
                    testID="settings-connect-apple-btn"
                    onPress={() => { void hapticLight(); void handleConnectApple(); }}
                    loading={isLinkingApple}
                  />
                )
              }
            />
          )}
        </View>

        <SectionLabel title="Privacy" />
        <View>
          <SettingsRow
            testID="settings-row-privacy"
            label="Privacy Settings"
            onPress={handlePrivacy}
          />
          <SettingsRow
            testID="settings-row-blocked"
            label="Blocked Accounts"
            onPress={handleBlocked}
          />
        </View>

        {user?.interaction_restricted_until != null && (
          <>
            <SectionLabel title="Account" />
            <View>
              <SettingsRow
                testID="settings-row-account-status"
                label="Social features limited"
                value="View status"
                valueColor="text-brand-teal"
                onPress={handleAccountStatus}
              />
            </View>
          </>
        )}

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

        <SectionLabel title="Legal" />
        <View>
          <SettingsRow
            testID="settings-row-community-guidelines"
            label="Community Guidelines"
            onPress={handleCommunityGuidelines}
          />
          <SettingsRow
            testID="settings-row-terms"
            label="Terms of Service"
            onPress={handleTerms}
          />
          <SettingsRow
            testID="settings-row-privacy-policy"
            label="Privacy Policy"
            onPress={handlePrivacyPolicy}
          />
        </View>

        <Pressable
          testID="settings-logout-btn"
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Log Out"
          className="mx-lg my-xl py-[14px] rounded-xl border-[1.5px] border-strong items-center active:opacity-70"
        >
          <AppText className="text-[15px] font-semibold text-default">Log Out</AppText>
        </Pressable>

        <SectionLabel title="Danger Zone" danger />
        <View>
          <SettingsRow
            testID="settings-row-delete"
            label={isDeletingAccount ? 'Deleting…' : 'Delete Account'}
            labelColor="text-danger font-semibold"
            valueColor="text-danger"
            onPress={isDeletingAccount ? undefined : handleDeleteAccount}
          />
        </View>

        <AppText className="text-center text-[12px] text-muted pb-lg">
          Beach League v1.0.0
        </AppText>

      </ScrollView>

      <ConfirmDialog
        visible={showLogoutConfirm}
        title="Log Out?"
        message="Are you sure you want to log out of Beach League?"
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        confirmVariant="destructive"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
        testID="logout-dialog"
      />
      <DeleteAccountDialog
        visible={showDeleteConfirm}
        isPending={isDeletingAccount}
        errorMessage={deleteError}
        onCancel={() => setShowDeleteConfirm(false)}
        onSchedule={scheduleAccountDeletion}
        onDeleteNow={deleteAccountNow}
      />
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
