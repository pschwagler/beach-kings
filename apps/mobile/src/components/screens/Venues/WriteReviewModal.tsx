/**
 * WriteReviewModal — modal for creating or editing a court review.
 *
 * Behaviour:
 *   - CREATE mode (existingReview === null): submits via api.createCourtReview.
 *   - EDIT mode (existingReview provided): form is prefilled; saves via
 *     api.updateCourtReview. A Delete button is also shown that calls
 *     api.deleteCourtReview after a confirmation step.
 *
 * On success, calls onSuccess() then closes. On API error, shows an inline
 * error message without closing.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppText from '@/components/ui/AppText';
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { usePaletteColors } from '@/theme/usePaletteColors';
import {
  courtQueries,
  invalidateCourtQueries,
  type CourtReviewTag,
} from '@/features/courts';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal local tag shape for state. The api-client returns additional fields
 * (slug, sort_order) that are not needed for display; they are dropped here.
 */
interface ExistingReview {
  readonly id: number;
  readonly rating: number;
  readonly review_text?: string | null;
  readonly tags?: ReadonlyArray<{ id: number }> | null;
}

interface WriteReviewModalProps {
  /** Controls modal visibility. */
  readonly visible: boolean;
  /** Court numeric id. */
  readonly courtId: number;
  /** If set, opens in edit mode prefilled with this review's data. */
  readonly existingReview: ExistingReview | null;
  /** Called when the modal should close (cancel or after success). */
  readonly onClose: () => void;
  /** Called after a successful create, update, or delete. */
  readonly onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STAR_COUNT = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WriteReviewModal({
  visible,
  courtId,
  existingReview,
  onClose,
  onSuccess,
}: WriteReviewModalProps): React.ReactNode {
  const palette = usePaletteColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isEdit = existingReview != null;

  // Form state
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 0);
  const [text, setText] = useState<string>(existingReview?.review_text ?? '');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(
    existingReview?.tags?.map((t) => t.id) ?? [],
  );
  const reviewTags = useQuery(courtQueries.reviewTags(visible));
  const allTags = reviewTags.data ?? [];

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const submitDisabled = rating === 0 || submitting;

  // Reset form when modal opens or existingReview changes
  useEffect(() => {
    if (visible) {
      setRating(existingReview?.rating ?? 0);
      setText(existingReview?.review_text ?? '');
      setSelectedTagIds(existingReview?.tags?.map((t) => t.id) ?? []);
      setError(null);
      setConfirmingDelete(false);
    }
  }, [visible, existingReview]);

  const toggleTag = useCallback((tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // review_text is sent as null (not omitted) when empty so callers can
      // distinguish "explicitly cleared" from "not provided".
      const reviewText = text.trim().length > 0 ? text.trim() : null;

      if (isEdit && existingReview != null) {
        await api.updateCourtReview(courtId, existingReview.id, {
          rating,
          review_text: reviewText,
          tag_ids: selectedTagIds,
        });
      } else {
        await api.createCourtReview(courtId, {
          rating,
          review_text: reviewText,
          tag_ids: selectedTagIds,
        });
      }

      await invalidateCourtQueries(queryClient, user?.id ?? 0);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? 'Failed to submit review. Please try again.';
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  }, [rating, text, selectedTagIds, isEdit, existingReview, courtId, queryClient, user?.id, onSuccess, onClose]);

  const handleDeletePress = useCallback(() => {
    setConfirmingDelete(true);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setConfirmingDelete(false);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (existingReview == null) return;

    setDeleting(true);
    setError(null);

    try {
      await api.deleteCourtReview(courtId, existingReview.id);

      await invalidateCourtQueries(queryClient, user?.id ?? 0);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? 'Failed to delete review. Please try again.';
      setError(detail);
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }, [existingReview, courtId, queryClient, user?.id, onSuccess, onClose]);

  // Group tags by category for display
  const tagsByCategory = allTags.reduce<Record<string, CourtReviewTag[]>>(
    (acc, tag) => {
      const cat = tag.category ?? 'General';
      return { ...acc, [cat]: [...(acc[cat] ?? []), tag] };
    },
    {},
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={isEdit ? 'Edit Your Review' : 'Write a Review'}
    >
      <ScrollView
        testID="write-review-modal"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Error message */}
        {error != null && (
          <View
            testID="review-error-msg"
            className="bg-danger-tint border border-danger rounded-lg px-4 py-3 mb-4"
          >
            <AppText className="text-[13px] text-danger">{error}</AppText>
          </View>
        )}

        {/* Star rating selector */}
        <AppText className="text-[14px] font-semibold text-default mb-2">
          Your Rating <AppText className="text-danger">*</AppText>
        </AppText>
        <View className="flex-row gap-2 mb-5">
          {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map((star) => {
            const selected = star <= rating;
            return (
              <Pressable
                key={star}
                testID={selected ? `star-btn-selected-${star}` : `star-btn-${star}`}
                onPress={() => setRating(star)}
                accessibilityRole="radio"
                accessibilityLabel={`${star} star${star !== 1 ? 's' : ''}`}
                accessibilityState={{ selected: star === rating }}
                className="min-h-touch min-w-touch items-center justify-center"
              >
                <AppText
                  className={`text-[32px] leading-none ${
                    selected ? 'text-accent' : 'text-tertiary'
                  }`}
                >
                  ★
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* Review text */}
        <AppText className="text-[14px] font-semibold text-default mb-2">
          Review <AppText className="text-muted">(optional)</AppText>
        </AppText>
        <TextInput
          testID="review-text-input"
          value={text}
          onChangeText={setText}
          placeholder="Share your experience..."
          placeholderTextColor={palette.textTertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={{
            color: palette.textDefault,
            borderColor: palette.borderStrong,
            borderWidth: 1,
            borderRadius: 10,
            padding: 12,
            minHeight: 100,
            marginBottom: 20,
            backgroundColor: palette.bgElevated,
          }}
        />

        {/* Tag picker */}
        {Object.keys(tagsByCategory).length > 0 && (
          <View className="mb-5">
            <AppText className="text-[14px] font-semibold text-default mb-3">
              Tags <AppText className="text-muted">(optional)</AppText>
            </AppText>
            {Object.entries(tagsByCategory).map(([category, tags]) => (
              <View key={category} className="mb-3">
                <AppText className="text-[12px] text-tertiary uppercase tracking-wide mb-2">
                  {category}
                </AppText>
                <View className="flex-row flex-wrap gap-2">
                  {tags.map((tag) => {
                    const active = selectedTagIds.includes(tag.id);
                    return (
                      <Pressable
                        key={tag.id}
                        testID={`tag-btn-${tag.id}`}
                        onPress={() => toggleTag(tag.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
                        className={`px-3 py-1.5 rounded-full border ${
                          active
                            ? 'bg-brand-teal border-brand-teal'
                            : 'bg-surface border-strong'
                        }`}
                      >
                        <AppText
                          className={`text-[13px] font-medium ${
                            active ? 'text-on-brand-teal' : 'text-default'
                          }`}
                        >
                          {tag.name}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Submit button */}
        <Pressable
          testID="submit-review-btn"
          onPress={() => void handleSubmit()}
          disabled={submitDisabled}
          accessibilityRole="button"
          accessibilityLabel={isEdit ? 'Save review' : 'Submit review'}
          accessibilityState={{ disabled: submitDisabled, busy: submitting }}
          className="bg-brand-teal py-4 rounded-[10px] items-center mb-3 active:opacity-80"
          style={{ opacity: submitDisabled ? 0.6 : 1 }}
        >
          {submitting ? (
            <ActivityIndicator color={palette.onBrandTeal} />
          ) : (
            <AppText className="text-on-brand-teal font-bold text-[15px]">
              {isEdit ? 'Save Review' : 'Submit Review'}
            </AppText>
          )}
        </Pressable>

        {/* Delete section — edit mode only */}
        {isEdit && (
          confirmingDelete ? (
            <View className="mt-2">
              <AppText className="text-[13px] text-muted text-center mb-3">
                Are you sure you want to delete your review?
              </AppText>
              <View className="flex-row gap-3">
                <Pressable
                  testID="cancel-delete-btn"
                  onPress={handleDeleteCancel}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel delete"
                  className="flex-1 py-3 rounded-[10px] border border-strong items-center"
                >
                  <AppText className="text-[14px] font-semibold text-default">
                    Cancel
                  </AppText>
                </Pressable>
                <Pressable
                  testID="confirm-delete-btn"
                  onPress={() => void handleDeleteConfirm()}
                  disabled={deleting}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm delete review"
                  className="flex-1 py-3 rounded-[10px] bg-danger-fill items-center active:opacity-80"
                  style={{ opacity: deleting ? 0.6 : 1 }}
                >
                  {deleting ? (
                    <ActivityIndicator color={palette.onDanger} />
                  ) : (
                    <AppText className="text-on-danger font-bold text-[14px]">
                      Delete
                    </AppText>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              testID="delete-review-btn"
              onPress={handleDeletePress}
              accessibilityRole="button"
              accessibilityLabel="Delete review"
              className="py-3 rounded-[10px] items-center border border-danger mt-2"
            >
              <AppText className="text-[14px] font-semibold text-danger">
                Delete Review
              </AppText>
            </Pressable>
          )
        )}
      </ScrollView>
    </Modal>
  );
}
