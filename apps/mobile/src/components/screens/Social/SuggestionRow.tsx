/**
 * SuggestionRow — a suggested friend in the Social hub's Friends tab.
 *
 * Shows the suggested player's avatar, name, and a location meta line, plus an
 * outlined Add button that optimistically sends a friend request (it flips to a
 * non-interactive "Requested" pill while pending). The wireframe's "N mutual"
 * reason is backend-only data we don't have yet, so the location stands in
 * (tracked in the parity plan's Backlog epic).
 *
 * Wireframe ref: friends.html — .suggestion-item
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import Avatar from '@/components/ui/Avatar';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import type { Friend } from '@beach-kings/shared';

interface SuggestionRowProps {
  readonly suggestion: Friend;
  readonly onAdd: (playerId: number) => void;
  readonly onPress: (playerId: number) => void;
  /** True once an add request is optimistically in flight for this player. */
  readonly isPending: boolean;
}

export default function SuggestionRow({
  suggestion,
  onAdd,
  onPress,
  isPending,
}: SuggestionRowProps): React.ReactNode {
  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(suggestion.player_id);
  }, [onPress, suggestion.player_id]);

  const handleAdd = useCallback(() => {
    void hapticMedium();
    onAdd(suggestion.player_id);
  }, [onAdd, suggestion.player_id]);

  return (
    <Pressable
      testID={`suggestion-row-${suggestion.player_id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`View profile of ${suggestion.full_name}`}
      className="flex-row items-center gap-md px-lg py-md bg-surface border-b border-divider active:opacity-pressed"
    >
      <Avatar
        imageUrl={suggestion.avatar}
        name={suggestion.full_name}
        size="md"
        colorSeed={suggestion.player_id}
        accessible={false}
      />
      <View className="flex-1 min-w-0">
        <AppText
          className="text-subhead font-semibold text-default"
          numberOfLines={1}
        >
          {suggestion.full_name}
        </AppText>
        {suggestion.location_name != null && (
          <AppText
            className="text-caption text-muted mt-xxs"
            numberOfLines={1}
          >
            {suggestion.location_name}
          </AppText>
        )}
      </View>
      {isPending ? (
        <View
          testID={`suggestion-pending-${suggestion.player_id}`}
          className="px-md rounded-button bg-info-tint min-h-touch justify-center"
        >
          <AppText className="text-footnote font-semibold text-info">Requested</AppText>
        </View>
      ) : (
        <Pressable
          testID={`suggestion-add-btn-${suggestion.player_id}`}
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel={`Add ${suggestion.full_name} as friend`}
          className="px-md rounded-button border border-brand-teal bg-transparent min-h-touch justify-center active:opacity-pressed"
        >
          <AppText className="text-footnote font-semibold text-brand-teal">Add</AppText>
        </Pressable>
      )}
    </Pressable>
  );
}
