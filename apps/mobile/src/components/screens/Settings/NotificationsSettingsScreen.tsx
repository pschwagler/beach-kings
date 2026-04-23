/**
 * NotificationsSettingsScreen — push notification toggles.
 *
 * Sections:
 *   - Master push notifications toggle
 *   - Individual notification type toggles
 *   - Schedule (quiet hours — informational, no picker yet)
 *
 * Wireframe ref: settings-notifications.html
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import { hapticLight } from '@/utils/haptics';
import { useNotificationsScreen } from './useNotificationsScreen';
import type { PushNotificationPrefs } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToggleRowConfig {
  readonly key: keyof PushNotificationPrefs;
  readonly label: string;
}

// Map PushNotificationPrefs keys → display labels
const TOGGLE_ROWS: ToggleRowConfig[] = [
  { key: 'direct_messages', label: 'Chat Messages' },
  { key: 'league_messages', label: 'League Updates' },
  { key: 'friend_requests', label: 'Friend Requests' },
  { key: 'match_invites', label: 'Game Results' },
  { key: 'session_updates', label: 'Session Updates' },
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
    <Text className="text-[12px] font-bold uppercase tracking-wider px-lg pt-xl pb-sm text-text-muted dark:text-text-tertiary">
      {title}
    </Text>
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
      className={`flex-row items-center justify-between px-lg bg-white dark:bg-elevated border-b border-border dark:border-border-strong min-h-[48px] ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <Text className="text-[15px] text-text-default dark:text-content-primary">{label}</Text>
      <Switch
        testID={testID}
        value={value}
        onValueChange={() => {
          if (!disabled) {
            void hapticLight();
            onToggle();
          }
        }}
        disabled={disabled}
        trackColor={{ false: '#e0e0e0', true: '#22c55e' }}
        thumbColor="#fff"
        ios_backgroundColor="#e0e0e0"
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
        <View key={i} className="px-lg py-md bg-white dark:bg-elevated border-b border-border dark:border-border-strong">
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
      <Text className="text-base font-semibold text-text-default dark:text-content-primary text-center mb-sm">
        Could not load notification settings
      </Text>
      <Pressable
        testID="notifications-retry-btn"
        onPress={onRetry}
        className="bg-primary dark:bg-brand-teal px-xl py-sm rounded-xl active:opacity-80"
      >
        <Text className="text-white font-semibold text-sm">Retry</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function NotificationsSettingsScreen(): React.ReactNode {
  const { prefs, isLoading, error, onToggle, onRetry } = useNotificationsScreen();

  // Compute master toggle: true if ALL prefs are on
  const allEnabled =
    prefs != null && Object.values(prefs).every(Boolean);

  const handleMasterToggle = useCallback(() => {
    if (prefs == null) return;
    void hapticLight();
    // Toggle all off when all are on, or all on when any are off
    const newValue = !allEnabled;
    TOGGLE_ROWS.forEach(({ key }) => {
      if (prefs[key] !== newValue) {
        onToggle(key);
      }
    });
  }, [prefs, allEnabled, onToggle]);

  if (isLoading) {
    return (
      <SafeAreaView testID="notifications-settings-screen" className="flex-1 bg-bg-page dark:bg-base" edges={['top']}>
        <TopNav title="Notifications" showBack />
        <NotificationsSkeleton />
      </SafeAreaView>
    );
  }

  if (error != null) {
    return (
      <SafeAreaView testID="notifications-settings-screen" className="flex-1 bg-bg-page dark:bg-base" edges={['top']}>
        <TopNav title="Notifications" showBack />
        <NotificationsErrorState onRetry={onRetry} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      testID="notifications-settings-screen"
      className="flex-1 bg-bg-page dark:bg-base"
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
            <Text className="text-[12px] text-text-muted dark:text-text-tertiary px-lg py-sm">
              Enable push notifications to customize alerts
            </Text>
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

        <SectionHeader title="Schedule" />
        <View>
          <Pressable
            testID="quiet-hours-row"
            accessibilityRole="button"
            onPress={() => {
              // TODO(backend): quiet hours picker
            }}
            className="flex-row items-center justify-between px-lg bg-white dark:bg-elevated border-b border-border dark:border-border-strong min-h-[48px] active:opacity-70"
          >
            <Text className="text-[15px] text-text-default dark:text-content-primary">
              Quiet Hours
            </Text>
            <View className="flex-row items-center gap-sm">
              <Text className="text-[14px] text-text-muted dark:text-text-tertiary">
                10 PM - 7 AM
              </Text>
              <Text className="text-text-disabled text-lg">›</Text>
            </View>
          </Pressable>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
