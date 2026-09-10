import React from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import AppText from '@/components/ui/AppText';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface RefreshState {
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function RefreshAction({ state, label }: { state: RefreshState; label: string }) {
  return <Pressable onPress={state.onRefresh} disabled={state.refreshing}
    accessibilityRole="button" accessibilityLabel={`Refresh ${label}`}
    accessibilityState={{ busy: state.refreshing, disabled: state.refreshing }}
    className="min-h-11 px-lg justify-center items-center">
    <AppText className="text-footnote font-medium text-brand-teal">{state.refreshing ? 'Refreshing…' : `Refresh ${label}`}</AppText>
  </Pressable>;
}

export function RefreshOverlay({ state, pull, testID = 'refresh-indicator' }: {
  state: RefreshState; pull: 'idle' | 'pulling' | 'armed'; testID?: string;
}) {
  const palette = usePaletteColors();
  const reduced = useReducedMotion();
  if (Platform.OS !== 'ios' || (!state.refreshing && pull === 'idle')) return null;
  return <View pointerEvents="none" testID={testID} className="absolute top-sm self-center flex-row items-center gap-sm rounded-full bg-surface px-md py-sm">
    {state.refreshing && !reduced && <ActivityIndicator color={palette.brandTeal} size="small" />}
    <AppText accessibilityLiveRegion="polite" className="text-footnote text-default">
      {state.refreshing ? 'Refreshing…' : pull === 'armed' ? 'Release to refresh' : 'Pull to refresh'}
    </AppText>
  </View>;
}
