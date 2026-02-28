'use client';

import { useState, useRef, useCallback } from 'react';
import { Trash2, Star, Loader } from 'lucide-react';
import { updateCourtDiscovery, adminDeleteCourtPhoto, adminReorderCourtPhotos, adminDeleteReview } from '../../../services/api';
import ImageLightbox from '../../ui/ImageLightbox';

const TEXT_FIELDS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'hours', label: 'Hours', type: 'text' },
  { key: 'cost_info', label: 'Cost Info', type: 'text' },
  { key: 'parking_info', label: 'Parking Info', type: 'text' },
  { key: 'court_count', label: 'Court Count', type: 'number' },
];

const TEXTAREA_FIELDS = [
  { key: 'description', label: 'Description' },
];

const SELECT_FIELDS = [
  {
    key: 'surface_type',
    label: 'Surface Type',
    options: [
      { value: '', label: '\u2014' },
      { value: 'sand', label: 'Sand' },
      { value: 'indoor_sand', label: 'Indoor Sand' },
      { value: 'grass', label: 'Grass' },
      { value: 'hard', label: 'Hard Court' },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'approved', label: 'Approved' },
      { value: 'pending', label: 'Pending' },
      { value: 'rejected', label: 'Rejected' },
    ],
  },
];

const TOGGLE_FIELDS = [
  { key: 'is_free', label: 'Free' },
  { key: 'has_lights', label: 'Lights' },
  { key: 'has_restrooms', label: 'Restrooms' },
  { key: 'has_parking', label: 'Parking' },
  { key: 'nets_provided', label: 'Nets Provided' },
  { key: 'is_active', label: 'Active' },
];

/**
 * Expandable accordion form for inline court editing.
 * Includes Photos and Reviews sections with admin delete capabilities.
 * Only sends changed fields to the API.
 */
export default function CourtEditRow({ court, onSave, onCancel, photos = [], reviews = [], detailLoading = false }) {
  const [form, setForm] = useState(() => ({
    name: court.name || '',
    address: court.address || '',
    description: court.description || '',
    hours: court.hours || '',
    phone: court.phone || '',
    website: court.website || '',
    cost_info: court.cost_info || '',
    parking_info: court.parking_info || '',
    surface_type: court.surface_type || '',
    court_count: court.court_count ?? '',
    status: court.status || 'pending',
    is_free: court.is_free ?? false,
    has_lights: court.has_lights ?? false,
    has_restrooms: court.has_restrooms ?? false,
    has_parking: court.has_parking ?? false,
    nets_provided: court.nets_provided ?? false,
    is_active: court.is_active ?? true,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Local state for optimistic photo/review removal
  const [localPhotos, setLocalPhotos] = useState(photos);
  const [localReviews, setLocalReviews] = useState(reviews);

  // Keep local state in sync when props update (detail loads)
  const prevPhotosRef = useRef(photos);
  const prevReviewsRef = useRef(reviews);
  if (photos !== prevPhotosRef.current) {
    prevPhotosRef.current = photos;
    setLocalPhotos(photos);
  }
  if (reviews !== prevReviewsRef.current) {
    prevReviewsRef.current = reviews;
    setLocalReviews(reviews);
  }

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** Compute only the fields that differ from the original court. */
  const getChangedFields = () => {
    const changed = {};
    for (const key of Object.keys(form)) {
      let original = court[key];
      let current = form[key];
      // Normalize nulls to match form defaults
      if (original == null) original = typeof current === 'boolean' ? false : '';
      if (key === 'court_count') {
        original = court.court_count ?? '';
        current = current === '' ? '' : Number(current);
        if (String(original) !== String(current) && current !== '') {
          changed[key] = current;
        }
        continue;
      }
      if (original !== current) {
        changed[key] = current;
      }
    }
    return changed;
  };

  const handleSave = async () => {
    const changed = getChangedFields();
    if (Object.keys(changed).length === 0) {
      onCancel();
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await updateCourtDiscovery(court.id, changed);
      // Merge changed fields back for optimistic update
      onSave({ ...court, ...changed });
    } catch (err) {
      console.error('Error saving court:', err);
      setError(err.response?.data?.detail || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-court-edit-form" onClick={(e) => e.stopPropagation()}>
      {error && <div className="error-message" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="admin-court-edit-grid">
        {TEXT_FIELDS.map(({ key, label, type }) => (
          <div key={key} className="admin-court-edit-field">
            <label>{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={(e) => handleChange(key, type === 'number' ? e.target.value : e.target.value)}
            />
          </div>
        ))}

        {TEXTAREA_FIELDS.map(({ key, label }) => (
          <div key={key} className="admin-court-edit-field admin-court-edit-field--full">
            <label>{label}</label>
            <textarea
              value={form[key]}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          </div>
        ))}

        {SELECT_FIELDS.map(({ key, label, options }) => (
          <div key={key} className="admin-court-edit-field">
            <label>{label}</label>
            <select value={form[key]} onChange={(e) => handleChange(key, e.target.value)}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}

        <div className="admin-court-edit-field admin-court-edit-field--full">
          <label>Toggles</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {TOGGLE_FIELDS.map(({ key, label }) => (
              <div key={key} className="admin-court-edit-toggle">
                <input
                  type="checkbox"
                  id={`edit-${court.id}-${key}`}
                  checked={form[key]}
                  onChange={(e) => handleChange(key, e.target.checked)}
                />
                <label htmlFor={`edit-${court.id}-${key}`}>{label}</label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-court-edit-actions">
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button className="btn-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>

      {/* Photos section */}
      <PhotosSection
        courtId={court.id}
        photos={localPhotos}
        onPhotoDeleted={(photoId) => setLocalPhotos((prev) => prev.filter((p) => p.id !== photoId))}
        onPhotosReordered={(reordered) => setLocalPhotos(reordered)}
        detailLoading={detailLoading}
      />

      {/* Reviews section */}
      <ReviewsSection
        reviews={localReviews}
        onReviewDeleted={(reviewId) => setLocalReviews((prev) => prev.filter((r) => r.id !== reviewId))}
        detailLoading={detailLoading}
      />
    </div>
  );
}


/**
 * Thumbnail strip of court photos with drag-and-drop reordering and inline-confirm delete.
 * First photo is the cover photo.
 */
function PhotosSection({ courtId, photos, onPhotoDeleted, onPhotosReordered, detailLoading }) {
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const timerRef = useRef(null);

  const handleDeleteClick = useCallback((photoId) => {
    if (confirmId === photoId) {
      clearTimeout(timerRef.current);
      setConfirmId(null);
      doDelete(photoId);
    } else {
      setConfirmId(photoId);
      timerRef.current = setTimeout(() => setConfirmId(null), 3000);
    }
  }, [confirmId]);

  const doDelete = async (photoId) => {
    try {
      setDeletingId(photoId);
      await adminDeleteCourtPhoto(photoId);
      onPhotoDeleted(photoId);
    } catch (err) {
      console.error('Error deleting photo:', err);
    } finally {
      setDeletingId(null);
    }
  };

  /** Reorder on drop: optimistic update, revert on API failure. */
  const handleDrop = async (e, targetIdx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const reordered = [...photos];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const prev = photos;

    // Optimistic update
    onPhotosReordered(reordered);
    setDragIdx(null);
    setOverIdx(null);

    try {
      await adminReorderCourtPhotos(courtId, reordered.map((p) => p.id));
    } catch (err) {
      console.error('Error reordering photos:', err);
      onPhotosReordered(prev);
    }
  };

  return (
    <div className="admin-court-photos">
      <div className="admin-court-photos__header">Photos</div>
      {detailLoading ? (
        <div className="admin-court-photos__loading">
          <Loader size={16} className="spinning" /> Loading...
        </div>
      ) : photos.length === 0 ? (
        <p className="admin-court-photos__empty">No photos.</p>
      ) : (
        <div className="admin-court-photos__grid">
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              className={
                'admin-court-photos__item'
                + (dragIdx === idx ? ' admin-court-photos__item--dragging' : '')
                + (overIdx === idx && dragIdx !== idx ? ' admin-court-photos__item--over' : '')
              }
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
              onDragLeave={() => setOverIdx((prev) => (prev === idx ? null : prev))}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            >
              {idx === 0 && <span className="admin-court-photos__cover-badge">Cover</span>}
              <img
                src={photo.url}
                alt=""
                className="admin-court-photos__thumb"
                style={{ cursor: 'pointer' }}
                onClick={() => setLightboxIndex(idx)}
              />
              <button
                className={`admin-court-photos__delete ${confirmId === photo.id ? 'admin-court-photos__delete--confirm' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleDeleteClick(photo.id); }}
                disabled={deletingId === photo.id}
                title={confirmId === photo.id ? 'Click again to confirm' : 'Delete photo'}
              >
                {deletingId === photo.id
                  ? <Loader size={12} className="spinning" />
                  : confirmId === photo.id
                    ? 'Confirm?'
                    : <Trash2 size={12} />
                }
              </button>
            </div>
          ))}
        </div>
      )}

      {lightboxIndex !== null && photos.length > 0 && (
        <ImageLightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}


/**
 * Compact list of reviews with inline-confirm delete.
 */
function ReviewsSection({ reviews, onReviewDeleted, detailLoading }) {
  const [confirmId, setConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const timerRef = useRef(null);

  const handleDeleteClick = useCallback((reviewId) => {
    if (confirmId === reviewId) {
      clearTimeout(timerRef.current);
      setConfirmId(null);
      doDelete(reviewId);
    } else {
      setConfirmId(reviewId);
      timerRef.current = setTimeout(() => setConfirmId(null), 3000);
    }
  }, [confirmId]);

  const doDelete = async (reviewId) => {
    try {
      setDeletingId(reviewId);
      await adminDeleteReview(reviewId);
      onReviewDeleted(reviewId);
    } catch (err) {
      console.error('Error deleting review:', err);
    } finally {
      setDeletingId(null);
    }
  };

  /** Render star icons for a rating. */
  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        size={12}
        className={i < rating ? 'admin-court-reviews__star--filled' : 'admin-court-reviews__star--empty'}
        fill={i < rating ? 'var(--primary)' : 'none'}
        stroke={i < rating ? 'var(--primary)' : 'var(--gray-300)'}
      />
    ));
  };

  return (
    <div className="admin-court-reviews">
      <div className="admin-court-reviews__header">Reviews</div>
      {detailLoading ? (
        <div className="admin-court-reviews__loading">
          <Loader size={16} className="spinning" /> Loading...
        </div>
      ) : reviews.length === 0 ? (
        <p className="admin-court-reviews__empty">No reviews.</p>
      ) : (
        <div className="admin-court-reviews__list">
          {reviews.map((review) => (
            <div key={review.id} className="admin-court-reviews__item">
              <div className="admin-court-reviews__info">
                <span className="admin-court-reviews__author">
                  {review.author?.full_name || 'Unknown'}
                </span>
                <span className="admin-court-reviews__stars">
                  {renderStars(review.rating)}
                </span>
                {review.review_text && (
                  <span className="admin-court-reviews__text">
                    {review.review_text.length > 80
                      ? review.review_text.slice(0, 80) + '...'
                      : review.review_text}
                  </span>
                )}
              </div>
              <button
                className={`admin-court-reviews__delete ${confirmId === review.id ? 'admin-court-reviews__delete--confirm' : ''}`}
                onClick={() => handleDeleteClick(review.id)}
                disabled={deletingId === review.id}
                title={confirmId === review.id ? 'Click again to confirm' : 'Delete review'}
              >
                {deletingId === review.id
                  ? <Loader size={12} className="spinning" />
                  : confirmId === review.id
                    ? 'Confirm?'
                    : <Trash2 size={14} />
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
