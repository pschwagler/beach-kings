/**
 * AppearanceSettingsScreen — choose between Light, Dark, and System theme.
 *
 * Selection is persisted via the ThemeContext (SecureStore) and applied
 * immediately to NativeWind's color scheme.
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import { hapticLight } from '@/utils/haptics';
import { useTheme } from '@/contexts/ThemeContext';

type ThemeMode = 'light' | 'dark' | 'system';

interface OptionDef {
  readonly mode: ThemeMode;
  readonly label: string;
  readonly description: string;
  readonly testID: string;
}

const OPTIONS: readonly OptionDef[] = [
  {
    mode: 'system',
    label: 'System',
    description: 'Match your device setting',
    testID: 'appearance-option-system',
  },
  {
    mode: 'light',
    label: 'Light',
    description: 'Always use light mode',
    testID: 'appearance-option-light',
  },
  {
    mode: 'dark',
    label: 'Dark',
    description: 'Always use dark mode',
    testID: 'appearance-option-dark',
  },
];

export default function AppearanceSettingsScreen(): React.ReactNode {
  const { themeMode, setThemeMode } = useTheme();

  const handleSelect = useCallback(
    (mode: ThemeMode) => {
      void hapticLight();
      setThemeMode(mode);
    },
    [setThemeMode],
  );

  return (
    <SafeAreaView
      testID="appearance-settings-screen"
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Appearance" showBack />

      <ScrollView className="flex-1">
        <Text className="text-[15px] font-bold px-lg pt-xl pb-sm text-text-default dark:text-content-primary">
          Theme
        </Text>

        <View>
          {OPTIONS.map((option) => {
            const isActive = option.mode === themeMode;
            return (
              <Pressable
                key={option.mode}
                testID={option.testID}
                onPress={() => handleSelect(option.mode)}
                accessibilityRole="button"
                accessibilityLabel={`${option.label} theme`}
                accessibilityState={{ selected: isActive }}
                className="flex-row items-center justify-between px-lg py-[14px] bg-white dark:bg-elevated border-b border-border dark:border-border-strong last:border-0 active:opacity-70"
              >
                <View className="flex-1 pr-md">
                  <Text className="text-[15px] text-text-default dark:text-content-primary">
                    {option.label}
                  </Text>
                  <Text className="text-[13px] text-text-muted dark:text-text-tertiary mt-[2px]">
                    {option.description}
                  </Text>
                </View>
                {isActive && (
                  <Text
                    testID={`${option.testID}-check`}
                    className="text-[18px] font-bold text-brand-teal"
                  >
                    ✓
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
