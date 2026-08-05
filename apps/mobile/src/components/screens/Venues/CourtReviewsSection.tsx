/**
 * CourtReviewsSection — reviews list section for the court detail screen.
 *
 * Renders:
 *   - Section header with review count + "Write a Review" / "Edit Your Review" action.
 *   - Empty state with CTA when no reviews exist.
 *   - Sorted list of CourtReviewCard components.
 *   - WriteReviewModal for creating or editing a review.
 *
 * The current player's review is detected by matching `author.player_id`
 * against `currentPlayerId`. When matched, the action button opens the modal
 * in edit (prefilled) mode.
 */

import React, { useState, useCallback, useMemo } from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import type { Court, CourtReview } from '@beach-kings/shared';
import CourtReviewCard from './CourtReviewCard';
import WriteReviewModal from './WriteReviewModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourtReviewsSectionProps {
  /** Full court object whose .reviews array is rendered. */
  readonly court: Court;
  /** The authenticated player's id (null/undefined if not logged in). */
  readonly currentPlayerId: number | null | undefined;
  /** Called after any successful review mutation so the parent can refetch. */
  readonly onReviewChanged?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CourtReviewsSection({
  court,
  currentPlayerId,
  onReviewChanged,
}: CourtReviewsSectionProps): React.ReactNode {
  const [modalVisible, setModalVisible] = useState(false);

  // Defensive sort: newest first (by created_at descending).
  const reviews = useMemo<CourtReview[]>(() => {
    const source = (court.reviews ?? []) as CourtReview[];
    return [...source].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [court.reviews]);
  const hasReviews = reviews.length > 0;

  // Detect whether the current player already has a review.
  const myReview = useMemo(
    () =>
      currentPlayerId != null
        ? reviews.find(
            (r) =>
              r.author?.player_id != null &&
              r.author.player_id === currentPlayerId,
          ) ?? null
        : null,
    [reviews, currentPlayerId],
  );

  const reviewCount = court.review_count ?? reviews.length;

  const handleActionPress = useCallback(() => {
    setModalVisible(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleReviewSuccess = useCallback(() => {
    setModalVisible(false);
    onReviewChanged?.();
  }, [onReviewChanged]);

  const handleEditPress = useCallback(
    (_review: CourtReview) => {
      setModalVisible(true);
    },
    [],
  );

  return (
    <View
      testID="court-reviews-section"
      className="px-4 pt-4 pb-4"
    >
      {/* Section header */}
      <View className="flex-row items-center justify-between mb-4">
        <AppText className="text-[16px] font-bold text-default">
          Reviews{reviewCount > 0 ? ` (${reviewCount})` : ''}
        </AppText>

        {hasReviews && (
          <Pressable
            testID="write-review-btn"
            onPress={handleActionPress}
            accessibilityRole="button"
            accessibilityLabel={
              myReview != null ? 'Edit Your Review' : 'Write a Review'
            }
            className="min-h-touch px-3 rounded-full border border-brand-teal items-center justify-center active:opacity-70"
          >
            <AppText className="text-[13px] font-semibold text-brand-teal">
              {myReview != null ? 'Edit Your Review' : 'Write a Review'}
            </AppText>
          </Pressable>
        )}
      </View>

      {/* Empty state */}
      {!hasReviews && (
        <View testID="reviews-empty-state" className="py-6 items-center">
          <AppText className="text-[14px] text-muted text-center mb-4">
            No reviews yet. Be the first to review!
          </AppText>
          <Pressable
            testID="write-review-btn"
            onPress={handleActionPress}
            accessibilityRole="button"
            accessibilityLabel="Write a Review"
            className="min-h-touch px-5 rounded-[10px] bg-brand-teal items-center justify-center active:opacity-80"
          >
            <AppText className="text-on-brand-teal font-bold text-[14px]">
              Write a Review
            </AppText>
          </Pressable>
        </View>
      )}

      {/* Review list */}
      {reviews.map((review) => (
        <CourtReviewCard
          key={review.id}
          review={review}
          currentPlayerId={currentPlayerId}
          courtId={court.id as number}
          onEditPress={() => handleEditPress(review)}
          onDeleteSuccess={handleReviewSuccess}
        />
      ))}

      {/* Write / Edit modal */}
      <WriteReviewModal
        visible={modalVisible}
        courtId={court.id as number}
        existingReview={
          myReview != null
            ? {
                id: myReview.id,
                rating: myReview.rating,
                review_text: myReview.review_text,
                tags: myReview.tags,
              }
            : null
        }
        onClose={handleModalClose}
        onSuccess={handleReviewSuccess}
      />
    </View>
  );
}
