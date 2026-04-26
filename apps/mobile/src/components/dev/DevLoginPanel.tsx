import React from 'react';
import { View, Text, Pressable } from 'react-native';

const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_USER_EMAIL ?? '';
const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_USER_PASSWORD ?? '';

interface DevLoginPanelProps {
  readonly onSelect: (email: string, password: string) => void;
}

export default function DevLoginPanel({ onSelect }: DevLoginPanelProps): React.ReactNode {
  if (!__DEV__ || !DEV_EMAIL || !DEV_PASSWORD) return null;

  return (
    <View className="mt-lg border border-dashed border-yellow-400 rounded-card p-md gap-sm">
      <Text className="text-xs text-yellow-400 font-bold text-center tracking-widest">
        DEV ONLY
      </Text>
      <Pressable
        onPress={() => onSelect(DEV_EMAIL, DEV_PASSWORD)}
        accessibilityLabel="Dev quick login"
        accessibilityRole="button"
        className="bg-yellow-400/10 border border-yellow-400 rounded-lg py-2 items-center active:opacity-70"
      >
        <Text className="text-yellow-400 text-sm font-semibold">
          Quick Login ({DEV_EMAIL.split('@')[0]})
        </Text>
      </Pressable>
    </View>
  );
}
