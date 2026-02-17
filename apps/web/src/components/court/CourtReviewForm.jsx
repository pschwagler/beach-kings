'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { createCourtReview, updateCourtReview, uploadReviewPhoto, getCourtTags } from '../../services/api';
import StarRating from '../ui/StarRating';
import { Button } from '../ui/UI';
import { MAX_PHOTOS_PER_REVIEW } from '../../constants/court';

/**
 * Inline review form for creating/editing a court review.
 * Includes star input, text area, tag picker, and photo upload.
 */
export default function CourtReviewForm({ courtId, existingReview, onSuccess, onCancel }) {
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [text, setText] = useState(existingReview?.review_text || '');
  const [selectedTagIds, setSelectedTagIds] = useState(
    existingReview?.tags?.map((t) => t.id) || []
  );
  const [allTags, setAllTags] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [photoUrls, setPhotoUrls] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    getCourtTags().then(setAllTags).catch(() => {});
  }, []);

  // Create and revoke object URLs to prevent memory leaks
  useEffect(() => {
    const urls = photos.map((file) => URL.createObjectURL(file));
    setPhotoUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  const toggleTag = (tagId) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const maxNew = MAX_PHOTOS_PER_REVIEW - photos.length;
    setPhotos((prev) => [...prev, ...files.slice(0, maxNew)]);
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a star rating');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      let result;
      if (existingReview) {
        result = await updateCourtReview(courtId, existingReview.id, {
          rating,
          review_text: text || null,
          tag_ids: selectedTagIds,
        });
      } else {
        result = await createCourtReview(courtId, {
          rating,
          review_text: text || null,
          tag_ids: selectedTagIds,
        });
      }

      // Upload new photos (two-step: review created, then photos)
      const reviewId = result.review_id || existingReview?.id;
      if (reviewId && photos.length > 0) {
        for (const file of photos) {
          try {
            await uploadReviewPhoto(courtId, reviewId, file);
          } catch (err) {
            console.error('Photo upload failed:', err);
          }
        }
      }

      onSuccess?.(result);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to submit review';
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  // Group tags by category
  const tagsByCategory = allTags.reduce((acc, tag) => {
    if (!acc[tag.category]) acc[tag.category] = [];
    acc[tag.category].push(tag);
    return acc;
  }, {});

  return (
    <form className="court-review-form" data-testid="court-review-form" onSubmit={handleSubmit}>
      <h3 className="court-review-form__title">
        {existingReview ? 'Edit Your Review' : 'Write a Review'}
      </h3>

      {error && <p className="court-review-form__error">{error}</p>}

      <div className="court-review-form__rating">
        <label>Your Rating</label>
        <StarRating value={rating} onChange={setRating} size={28} />
      </div>

      <div className="court-review-form__field">
        <label>Review (optional)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share your experience..."
          rows={4}
        />
      </div>

      {Object.entries(tagsByCategory).length > 0 && (
        <div className="court-review-form__tags">
          <label>Tags</label>
          {Object.entries(tagsByCategory).map(([category, tags]) => (
            <div key={category} className="court-review-form__tag-group">
              <span className="court-review-form__tag-category">{category}</span>
              <div className="court-review-form__tag-chips">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`court-review-form__tag-chip${selectedTagIds.includes(tag.id) ? ' court-review-form__tag-chip--selected' : ''}`}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!existingReview && (
        <div className="court-review-form__photos">
          <label>Photos (up to {MAX_PHOTOS_PER_REVIEW})</label>
          <div className="court-review-form__photo-previews">
            {photos.map((file, i) => (
              <div key={i} className="court-review-form__photo-preview">
                <img src={photoUrls[i]} alt={`Upload ${i + 1}`} />
                <button
                  type="button"
                  className="court-review-form__photo-remove"
                  onClick={() => removePhoto(i)}
                  aria-label="Remove photo"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS_PER_REVIEW && (
              <button
                type="button"
                className="court-review-form__photo-add"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={20} />
                <span>Add Photo</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePhotoSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}

      <div className="court-review-form__actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting || rating === 0}>
          {submitting ? 'Submitting...' : existingReview ? 'Update Review' : 'Submit Review'}
        </Button>
      </div>
    </form>
  );
}
