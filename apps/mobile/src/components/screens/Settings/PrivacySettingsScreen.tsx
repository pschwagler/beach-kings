/**
 * Privacy Settings screen.
 *
 * Exposes two toggles backed by the auth user:
 *   - "Private profile" — hides W-L/stats from non-league members.
 *   - "Show game history" — makes game history visible on the public profile.
 *
 * Toggles call `api.updateUserProfile` with just the changed field, optimistically
 * update local state, and revert on failure. The `Switch` track/thumb colours are
 * read from `usePaletteColors()` — no hardcoded hex.
 */

import React from 'react';
import { View, Text, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import { routes } from '@/lib/navigation';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { usePrivacySettingsScreen } from './usePrivacySettingsScreen';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PrivacyRowProps {
  readonly label: string;
  readonly description: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly testID?: string;
}

function PrivacyRow({
  label,
  description,
  value,
  onValueChange,
  testID,
}: PrivacyRowProps): React.ReactNode {
  const palette = usePaletteColors();

  return (
    <View
      testID={testID}
      className="flex-row items-start justify-between px-lg py-[14px] bg-surface border-b border-divider"
    >
      <View className="flex-1 pr-md">
        <Text className="text-[15px] text-default font-medium mb-[2px]">{label}</Text>
        <Text className="text-[13px] text-muted leading-[18px]">{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: palette.borderStrong,
          true: palette.brandTeal,
        }}
        thumbColor={palette.bgElevated}
        ios_backgroundColor={palette.borderStrong}
        accessibilityLabel={label}
        accessibilityRole="switch"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function PrivacySettingsScreen(): React.ReactNode {
  const {
    profileIsPrivate,
    showGameHistory,
    handleTogglePrivateProfile,
    handleToggleShowGameHistory,
  } = usePrivacySettingsScreen();

  return (
    <SafeAreaView
      testID="privacy-settings-screen"
      className="flex-1 bg-page"
      edges={['top']}
    >
      <TopNav title="Privacy" showBack backFallback={routes.settings()} />

      <ScrollView className="flex-1">
        <Text className="text-[15px] font-bold px-lg pt-xl pb-sm text-default">
          Profile Visibility
        </Text>

        <PrivacyRow
          testID="privacy-row-private-profile"
          label="Private profile"
          description="When on, your win-loss record and stats are hidden from players who are not in one of your leagues."
          value={profileIsPrivate}
          onValueChange={handleTogglePrivateProfile}
        />

        <PrivacyRow
          testID="privacy-row-show-game-history"
          label="Show game history on public profile"
          description="When on, other players can see a history of the games you have played on your public profile."
          value={showGameHistory}
          onValueChange={handleToggleShowGameHistory}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
