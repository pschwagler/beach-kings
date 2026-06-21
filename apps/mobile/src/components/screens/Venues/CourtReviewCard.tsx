/**
 * CourtReviewCard — displays a single court review.
 *
 * Shows: star rating, author avatar (or initials fallback), author name,
 * date, review text, tag pills, and photo thumbnails. Edit/delete actions
 * are shown only for the current player's own review.
 */

import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
} from 'react-native';
import type { CourtReview } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourtReviewCardProps {
  /** The review to display. */
  readonly review: CourtReview;
  /** The authenticated player's id, used to determine if own review. */
  readonly currentPlayerId: number | null | undefined;
  /** The court's numeric id (for delete calls). */
  readonly courtId: number;
  /** Called when the edit action is pressed. */
  readonly onEditPress: () => void;
  /** Called after a successful delete with the updated aggregate data. */
  readonly onDeleteSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the first letter of a name, uppercased, as an avatar initial.
 * Falls back to '?' when name is empty.
 */
function getInitial(name: string | null | undefined): string {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
}

/**
 * Formats an ISO date string to "Jan 15, 2026".
 * Returns an empty string if the date is invalid.
 */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CourtReviewCard({
  review,
  currentPlayerId,
  onEditPress,
}: CourtReviewCardProps): React.ReactNode {
  const isOwn =
    currentPlayerId != null &&
    review.author?.player_id != null &&
    review.author.player_id === currentPlayerId;

  const hasTags = (review.tags?.length ?? 0) > 0;
  const hasPhotos = (review.photos?.length ?? 0) > 0;

  return (
    <View
      testID="court-review-card"
      className="bg-surface rounded-xl p-4 mb-3 border border-strong"
    >
      {/* Header: avatar + author info + edit action */}
      <View className="flex-row items-center mb-3">
        {/* Avatar */}
        {review.author?.avatar != null ? (
          <Image
            testID="review-card-avatar-image"
            source={{ uri: review.author.avatar }}
            className="w-9 h-9 rounded-full bg-surface mr-3"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            testID="review-card-avatar-initial"
            className="w-9 h-9 rounded-full bg-brand-teal items-center justify-center mr-3"
          >
            <Text className="text-[15px] font-bold text-inverse">
              {getInitial(review.author?.full_name)}
            </Text>
          </View>
        )}

        {/* Name + date */}
        <View className="flex-1">
          <Text className="text-[14px] font-semibold text-default" numberOfLines={1}>
            {review.author?.full_name ?? 'Anonymous'}
          </Text>
          <Text className="text-[12px] text-muted">
            {formatDate(review.created_at)}
          </Text>
        </View>

        {/* Edit button — own review only */}
        {isOwn && (
          <Pressable
            testID="review-edit-btn"
            onPress={onEditPress}
            accessibilityRole="button"
            accessibilityLabel="Edit review"
            className="min-h-touch min-w-touch items-center justify-center"
          >
            <Text className="text-[13px] text-brand-teal font-medium">Edit</Text>
          </Pressable>
        )}
      </View>

      {/* Star rating */}
      <View testID="review-card-stars" className="flex-row mb-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <Text
            key={star}
            className={`text-[16px] mr-0.5 ${
              star <= Math.round(review.rating) ? 'text-yellow-400' : 'text-gray-200'
            }`}
          >
            ★
          </Text>
        ))}
      </View>

      {/* Review text */}
      {review.review_text != null && review.review_text.length > 0 && (
        <Text className="text-[14px] text-default leading-5 mb-3">
          {review.review_text}
        </Text>
      )}

      {/* Tag pills */}
      {hasTags && (
        <View testID="review-card-tags" className="flex-row flex-wrap gap-2 mb-3">
          {(review.tags ?? []).map((tag) => (
            <View
              key={tag.id}
              className="px-2 py-0.5 rounded-full bg-info-tint border border-brand-teal"
            >
              <Text className="text-[12px] text-brand-teal font-medium">
                {tag.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Photo thumbnails */}
      {hasPhotos && (
        <ScrollView
          testID="review-card-photos"
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row"
          contentContainerStyle={{ gap: 8 }}
        >
          {(review.photos ?? []).map((photo) => (
            <Image
              key={photo.id}
              source={{ uri: photo.url }}
              className="w-[80px] h-[80px] rounded-lg bg-surface"
              accessibilityIgnoresInvertColors
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
