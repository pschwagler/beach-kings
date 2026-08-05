/**
 * NotificationsSettingsScreen — push notification toggles.
 *
 * Sections:
 *   - Master push notifications toggle
 *   - Individual notification type toggles
 *
 * Wireframe ref: settings-notifications.html
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { hapticLight } from '@/utils/haptics';
import { useNotificationsScreen } from './useNotificationsScreen';
import type { PushNotificationPrefs } from '@beach-kings/shared';
import AppSwitch from '@/components/ui/AppSwitch';
import Button from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToggleRowConfig {
  readonly key: keyof PushNotificationPrefs;
  readonly label: string;
}

// Map PushNotificationPrefs keys → display labels (excludes push_enabled master toggle)
const TOGGLE_ROWS: ToggleRowConfig[] = [
  { key: 'direct_messages', label: 'Chat Messages' },
  { key: 'league_messages', label: 'League Updates' },
  { key: 'friend_requests', label: 'Friend Requests' },
  { key: 'match_invites', label: 'Game Results' },
  { key: 'ranking_changes', label: 'Ranking Changes' },
  { key: 'tournament_updates', label: 'Tournament Alerts' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  readonly title: string;
}

function SectionHeader({ title }: SectionHeaderProps): React.ReactNode {
  return (
    <AppText className="text-[12px] font-bold uppercase tracking-wider px-lg pt-xl pb-sm text-muted">
      {title}
    </AppText>
  );
}

interface ToggleRowProps {
  readonly label: string;
  readonly value: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
  readonly testID?: string;
}

function ToggleRow({
  label,
  value,
  disabled = false,
  onToggle,
  testID,
}: ToggleRowProps): React.ReactNode {
  return (
    <View
      className={`flex-row items-center justify-between px-lg bg-surface border-b border-divider min-h-[48px] ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <AppText className="text-[15px] text-default">{label}</AppText>
      <AppSwitch
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={
          disabled ? 'Enable push notifications to change this setting' : undefined
        }
        value={value}
        onValueChange={() => {
          if (!disabled) {
            void hapticLight();
            onToggle();
          }
        }}
        disabled={disabled}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function NotificationsSkeleton(): React.ReactNode {
  return (
    <ScrollView testID="notifications-skeleton" className="flex-1" scrollEnabled={false}>
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <View key={i} className="px-lg py-md bg-surface border-b border-divider">
          <LoadingSkeleton width="100%" height={20} borderRadius={4} />
        </View>
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  readonly onRetry: () => void;
}

function NotificationsErrorState({ onRetry }: ErrorStateProps): React.ReactNode {
  return (
    <View
      testID="notifications-error"
      className="flex-1 items-center justify-center px-xl py-xxxl"
    >
      <AppText className="text-base font-semibold text-default text-center mb-sm">
        Could not load notification settings
      </AppText>
      <Button
        testID="notifications-retry-btn"
        title="Retry"
        onPress={onRetry}
        className="px-xl"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function NotificationsSettingsScreen(): React.ReactNode {
  const { prefs, isLoading, error, onToggle, onRetry } = useNotificationsScreen();

  // Master toggle is backed by the dedicated push_enabled field.
  const allEnabled = prefs?.push_enabled ?? false;

  const handleMasterToggle = useCallback(() => {
    if (prefs == null) return;
    void hapticLight();
    onToggle('push_enabled');
  }, [prefs, onToggle]);

  if (isLoading) {
    return (
      <SafeAreaView testID="notifications-settings-screen" className="flex-1 bg-page" edges={['top']}>
        <TopNav title="Notifications" showBack />
        <NotificationsSkeleton />
      </SafeAreaView>
    );
  }

  if (error != null) {
    return (
      <SafeAreaView testID="notifications-settings-screen" className="flex-1 bg-page" edges={['top']}>
        <TopNav title="Notifications" showBack />
        <NotificationsErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      testID="notifications-settings-screen"
      className="flex-1 bg-page"
      edges={['top']}
    >
      <TopNav title="Notifications" showBack />

      <ScrollView className="flex-1">

        <SectionHeader title="Push Notifications" />
        <View>
          <ToggleRow
            testID="toggle-master"
            label="Push Notifications"
            value={allEnabled}
            onToggle={handleMasterToggle}
          />
          {!allEnabled && prefs != null && (
            <AppText className="text-[12px] text-muted px-lg py-sm">
              Enable push notifications to customize alerts
            </AppText>
          )}
        </View>

        <SectionHeader title="Notification Types" />
        <View
          testID="notifications-types-section"
          className={!allEnabled && prefs != null ? 'opacity-40' : ''}
        >
          {TOGGLE_ROWS.map(({ key, label }) => (
            <ToggleRow
              key={key}
              testID={`toggle-${key}`}
              label={label}
              value={prefs?.[key] ?? false}
              disabled={!allEnabled && prefs != null}
              onToggle={() => {
                void hapticLight();
                onToggle(key);
              }}
            />
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
