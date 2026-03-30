'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { deleteCourtReview } from '../../services/api';
import StarRating from '../ui/StarRating';
import ImageLightbox from '../ui/ImageLightbox';
import type { ReviewActionResponse } from '../../types';

/**
 * Single review card in the reviews list.
 * Shows stars, text, tags, photos, author info, and edit/delete for own reviews.
 */
interface ReviewTag {
  id: number;
  name: string;
}

interface ReviewPhoto {
  id: number;
  url: string;
}

interface Review {
  id: number;
  rating: number;
  review_text?: string | null;
  created_at?: string | null;
  author?: { player_id?: number | null; full_name?: string | null } | null;
  tags?: ReviewTag[] | null;
  photos?: ReviewPhoto[] | null;
}

interface CourtReviewCardProps {
  review: Review;
  isOwn: boolean;
  onEdit: () => void;
  onDeleted?: (result?: ReviewActionResponse) => void;
  courtId: number;
}

export default function CourtReviewCard({ review, isOwn, onEdit, onDeleted, courtId }: CourtReviewCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteCourtReview(courtId, review.id);
      onDeleted?.(result);
    } catch (err) {
      console.error('Error deleting review:', err);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  const dateStr = review.created_at
    ? new Date(review.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : '';

  return (
    <div className="court-review-card" data-testid="court-review-card">
      <div className="court-review-card__header">
        <div className="court-review-card__author">
          <span className="court-review-card__author-name">{review.author?.full_name}</span>
          <span className="court-review-card__date">{dateStr}</span>
        </div>
        {isOwn && (
          <div className="court-review-card__actions">
            <button onClick={onEdit} aria-label="Edit review" className="court-review-card__action-btn">
              <Pencil size={14} />
            </button>
            {confirming ? (
              <span className="court-review-card__confirm">
                Delete?{' '}
                <button onClick={handleDelete} disabled={deleting} aria-label="Confirm delete review">Yes</button>
                <button onClick={() => setConfirming(false)} aria-label="Cancel delete">No</button>
              </span>
            ) : (
              <button onClick={() => setConfirming(true)} aria-label="Delete review" className="court-review-card__action-btn">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <StarRating value={review.rating} size={16} />

      {review.review_text && (
        <p className="court-review-card__text" data-testid="court-review-text">{review.review_text}</p>
      )}

      {(review.tags?.length ?? 0) > 0 && (
        <div className="court-review-card__tags">
          {(review.tags ?? []).map((tag) => (
            <span key={tag.id} className="court-review-card__tag">{tag.name}</span>
          ))}
        </div>
      )}

      {(review.photos?.length ?? 0) > 0 && (
        <div className="court-review-card__photos">
          {(review.photos ?? []).map((photo, idx) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={photo.url}
              alt="Review photo"
              loading="lazy"
              style={{ cursor: 'pointer' }}
              onClick={() => setLightboxIndex(idx)}
            />
          ))}
        </div>
      )}

      {lightboxIndex !== null && (review.photos?.length ?? 0) > 0 && (
        <ImageLightbox
          photos={review.photos ?? []}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
