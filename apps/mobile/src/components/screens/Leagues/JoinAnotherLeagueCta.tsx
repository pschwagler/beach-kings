/**
 * Dashed-border CTA card shown below the league list.
 * Mirrors the `.empty-cta` block in leagues-tab.html (line 149-153).
 *
 * Renders only when the user has at least one league — invites them to
 * browse more rather than acting as the empty state.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { TrophyIcon } from '@/components/ui/icons';

interface JoinAnotherLeagueCtaProps {
  readonly onPress: () => void;
}

export default function JoinAnotherLeagueCta({
  onPress,
}: JoinAnotherLeagueCtaProps): React.ReactNode {
  return (
    <Pressable
      testID="join-another-league-cta"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Join Another League"
      className="bg-surface rounded-card p-lg mt-xs items-center border border-dashed border-divider active:opacity-80"
    >
      <View className="mb-xs">
        <TrophyIcon size={24} color="#2a7d9c" />
      </View>
      <Text className="text-footnote font-semibold text-info">
        Join Another League
      </Text>
      <Text className="text-[12px] text-tertiary mt-[4px]">
        Browse open leagues near you
      </Text>
    </Pressable>
  );
}
