'use client';

import { useState, useCallback, useEffect } from 'react';
import { getPublicCourtBySlug } from '../../services/api';
import CourtReviewCard from './CourtReviewCard';
import CourtReviewForm from './CourtReviewForm';
import { Button } from '../ui/UI';

/**
 * Reviews section on the court detail page.
 *
 * Shows review list, "Write a Review" / "Edit Your Review" CTA,
 * and the inline review form. Refetches on mount to override stale ISR cache.
 */
export default function CourtReviewSection({ court, isAuthenticated, currentPlayerId, onAuthRequired }) {
  const [reviews, setReviews] = useState(court.reviews || []);
  const [avgRating, setAvgRating] = useState(court.average_rating);
  const [reviewCount, setReviewCount] = useState(court.review_count || 0);
  const [showForm, setShowForm] = useState(false);
  const [editingReview, setEditingReview] = useState(null);

  // Find the current user's review
  const myReview = reviews.find(
    (r) => r.author?.player_id && r.author.player_id === currentPlayerId
  );

  const refreshCourt = useCallback(async () => {
    try {
      const updated = await getPublicCourtBySlug(court.slug);
      setReviews(updated.reviews || []);
      setAvgRating(updated.average_rating);
      setReviewCount(updated.review_count || 0);
    } catch (err) {
      console.error('Error refreshing court:', err);
    }
  }, [court.slug]);

  // Refetch reviews on mount to override stale SSR/ISR cache
  useEffect(() => {
    refreshCourt();
  }, [refreshCourt]);

  const handleReviewAction = (result) => {
    if (result) {
      setAvgRating(result.average_rating);
      setReviewCount(result.review_count);
    }
    setShowForm(false);
    setEditingReview(null);
    refreshCourt();
  };

  const handleWriteReview = () => {
    if (!isAuthenticated) {
      onAuthRequired();
      return;
    }
    if (myReview) {
      setEditingReview(myReview);
    }
    setShowForm(true);
  };

  const handleEditReview = (review) => {
    setEditingReview(review);
    setShowForm(true);
  };

  return (
    <div className="court-detail__reviews">
      <div className="court-detail__reviews-header">
        <h2 className="court-detail__section-title">
          Reviews {reviewCount > 0 ? `(${reviewCount})` : ''}
        </h2>
        <Button onClick={handleWriteReview} variant="default" size="small">
          {myReview ? 'Edit Your Review' : 'Write a Review'}
        </Button>
      </div>

      {showForm && (
        <CourtReviewForm
          courtId={court.id}
          existingReview={editingReview}
          onSuccess={handleReviewAction}
          onCancel={() => { setShowForm(false); setEditingReview(null); }}
        />
      )}

      {reviews.length === 0 && !showForm && (
        <div className="court-detail__no-reviews">
          <p>Be the first to review this court!</p>
        </div>
      )}

      <div className="court-detail__reviews-list">
        {reviews.map((review) => (
          <CourtReviewCard
            key={review.id}
            review={review}
            isOwn={review.author?.player_id != null && review.author.player_id === currentPlayerId}
            onEdit={() => handleEditReview(review)}
            onDeleted={handleReviewAction}
            courtId={court.id}
          />
        ))}
      </div>
    </div>
  );
}
