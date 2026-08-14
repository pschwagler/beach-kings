'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Trash2, Star, Loader, Camera, CheckCircle2 } from 'lucide-react';
import { updateCourtDiscovery, adminDeleteCourtPhoto, adminReorderCourtPhotos, adminDeleteReview, uploadCourtPhoto } from '../../../services/api';
import ImageLightbox from '../../ui/ImageLightbox';
import CourtPinCorrectionMap from '../../court/CourtPinCorrectionMap';

const CONFIRM_TIMEOUT_MS = 3000;

const NULLABLE_CONDITION_FIELDS = new Set([
  'wind_exposure', 'wind_notes', 'sand_depth', 'sand_notes',
]);

const TEXT_FIELDS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'website', label: 'Official site / booking', type: 'url' },
  { key: 'hours', label: 'Hours', type: 'text' },
  { key: 'cost_info', label: 'Cost Info', type: 'text' },
  { key: 'parking_info', label: 'Parking Info', type: 'text' },
  { key: 'court_count', label: 'Court Count', type: 'number' },
];

const TEXTAREA_FIELDS = [
  { key: 'description', label: 'About', hint: 'Describe the setting, court setup, and what players should know.' },
  { key: 'wind_notes', label: 'Wind notes', hint: 'Typical wind details (140 characters max).', maxLength: 140 },
  { key: 'sand_notes', label: 'Sand notes', hint: 'Useful depth or consistency details (140 characters max).', maxLength: 140 },
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
    key: 'wind_exposure',
    label: 'Typical Wind',
    options: [
      { value: '', label: 'Unknown' }, { value: 'sheltered', label: 'Sheltered' }, { value: 'mixed', label: 'Mixed' }, { value: 'exposed', label: 'Exposed' },
    ],
  },
  {
    key: 'sand_depth',
    label: 'Sand Depth',
    options: [
      { value: '', label: 'Unknown' }, { value: 'shallow', label: 'Shallow' }, { value: 'typical', label: 'Typical' }, { value: 'deep', label: 'Deep' },
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

export interface CourtPhoto {
  id: number;
  url: string;
}

interface CourtReviewAuthor {
  full_name?: string;
}

export interface CourtReview {
  id: number;
  rating: number;
  review_text?: string;
  author?: CourtReviewAuthor;
}

export interface AdminCourt {
  id: number | string;
  name?: string;
  address?: string;
  description?: string;
  hours?: string;
  phone?: string;
  website?: string;
  cost_info?: string;
  parking_info?: string;
  wind_exposure?: string | null;
  wind_notes?: string | null;
  sand_depth?: string | null;
  sand_notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  surface_type?: string;
  court_count?: number | string;
  status?: string;
  is_free?: boolean;
  has_lights?: boolean;
  has_restrooms?: boolean;
  has_parking?: boolean;
  nets_provided?: boolean;
  is_active?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Expandable accordion form for inline court editing.
 * Includes Photos and Reviews sections with admin delete capabilities.
 * Only sends changed fields to the API.
 */
interface CourtEditRowProps {
  court: AdminCourt;
  onSave: (court: AdminCourt) => void;
  onCancel: () => void;
  photos?: CourtPhoto[];
  reviews?: CourtReview[];
  detailLoading?: boolean;
  showStatus?: boolean;
  showActive?: boolean;
  saveLabel?: string;
  closeLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onPublish?: (court: AdminCourt) => Promise<void>;
  onReject?: () => void;
  actionLoading?: boolean;
  rejectLabel?: string;
}

type CourtFormState = {
  name: string;
  address: string;
  description: string;
  hours: string;
  phone: string;
  website: string;
  cost_info: string;
  parking_info: string;
  wind_exposure: string;
  wind_notes: string;
  sand_depth: string;
  sand_notes: string;
  latitude: string | number;
  longitude: string | number;
  surface_type: string;
  court_count: string | number;
  status: string;
  is_free: boolean;
  has_lights: boolean;
  has_restrooms: boolean;
  has_parking: boolean;
  nets_provided: boolean;
  is_active: boolean;
  [key: string]: string | number | boolean;
};

export default function CourtEditRow({
  court,
  onSave,
  onCancel,
  photos = [],
  reviews = [],
  detailLoading = false,
  showStatus = true,
  showActive = true,
  saveLabel = 'Save changes',
  closeLabel = 'Close',
  onDirtyChange,
  onPublish,
  onReject,
  actionLoading = false,
  rejectLabel = 'Reject draft',
}: CourtEditRowProps) {
  const [form, setForm] = useState<CourtFormState>(() => ({
    name: court.name || '',
    address: court.address || '',
    description: court.description || '',
    hours: court.hours || '',
    phone: court.phone || '',
    website: court.website || '',
    cost_info: court.cost_info || '',
    parking_info: court.parking_info || '',
    wind_exposure: court.wind_exposure || '',
    wind_notes: court.wind_notes || '',
    sand_depth: court.sand_depth || '',
    sand_notes: court.sand_notes || '',
    latitude: court.latitude ?? '',
    longitude: court.longitude ?? '',
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
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Local state for optimistic photo/review removal
  const [localPhotos, setLocalPhotos] = useState<CourtPhoto[]>(photos);
  const [localReviews, setLocalReviews] = useState<CourtReview[]>(reviews);

  // Keep local state in sync when props update (detail loads)
  useEffect(() => { setLocalPhotos(photos); }, [photos]);
  useEffect(() => { setLocalReviews(reviews); }, [reviews]);

  const handleChange = (key: string, value: string | number | boolean) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** Compute only the fields that differ from the original court. */
  const getChangedFields = () => {
    const changed: Record<string, string | number | boolean | null> = {};
    for (const key of Object.keys(form)) {
      if (key === 'latitude' || key === 'longitude') continue;
      let original = court[key];
      let current = form[key];
      // Normalize nulls to match form defaults
      if (original == null) {
        original = typeof current === 'boolean' ? key === 'is_active' : '';
      }
      if (key === 'court_count') {
        original = court[key] ?? '';
        current = current === '' ? '' : Number(current);
        if (String(original) !== String(current) && current !== '') {
          changed[key] = current;
        }
        continue;
      }
      if (original !== current) {
        changed[key] = NULLABLE_CONDITION_FIELDS.has(key) && current === ''
          ? null
          : current;
      }
    }

    const latitude = form.latitude === '' ? null : Number(form.latitude);
    const longitude = form.longitude === '' ? null : Number(form.longitude);
    const latitudeChanged = latitude != null && String(court.latitude ?? '') !== String(latitude);
    const longitudeChanged = longitude != null && String(court.longitude ?? '') !== String(longitude);
    if (
      (latitudeChanged || longitudeChanged)
      && latitude != null
      && longitude != null
      && Number.isFinite(latitude)
      && Number.isFinite(longitude)
    ) {
      // A map pin is one atomic value. The API deliberately rejects a lone
      // coordinate, so include the unchanged half when either input moves.
      changed.latitude = latitude;
      changed.longitude = longitude;
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
      await updateCourtDiscovery(court.id as number, changed);
      // Merge changed fields back for optimistic update
      onSave({ ...court, ...changed });
      setSaved(true);
    } catch (err) {
      console.error('Error saving court:', err);
      setError(err.response?.data?.detail || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!onPublish) return;
    const changed = getChangedFields();
    const updatedCourt = { ...court, ...changed };
    try {
      setSaving(true);
      setError(null);
      if (Object.keys(changed).length > 0) {
        await updateCourtDiscovery(court.id as number, changed);
        onSave(updatedCourt);
      }
      await onPublish(updatedCourt);
    } catch (publishError) {
      console.error('Error publishing court:', publishError);
      setError(publishError.response?.data?.detail || 'Could not publish this court. Your draft is still waiting for review.');
    } finally {
      setSaving(false);
    }
  };

  const changedCount = Object.keys(getChangedFields()).length;

  useEffect(() => {
    onDirtyChange?.(changedCount > 0);
  }, [changedCount, onDirtyChange]);

  return (
    <div className="admin-court-edit-form" onClick={(e) => e.stopPropagation()}>
      <div className="admin-court-edit-heading">
        <div>
          <span>Staff controls</span>
          <h4>Court details</h4>
        </div>
        <small>{changedCount > 0 ? `${changedCount} unsaved ${changedCount === 1 ? 'change' : 'changes'}` : 'No unsaved changes'}</small>
      </div>

      {error && <div className="error-message admin-court-edit-message" role="alert">{error}</div>}
      {saved && (
        <div className="admin-court-edit-saved" role="status">
          <CheckCircle2 size={16} /> Changes saved
        </div>
      )}

      <div className="admin-court-edit-grid">
        {TEXT_FIELDS.map(({ key, label, type }) => (
          <div key={key} className="admin-court-edit-field">
            <label htmlFor={`edit-${court.id}-${key}`}>{label}</label>
            <input
              id={`edit-${court.id}-${key}`}
              type={type}
              value={form[key] as string | number}
              onChange={(e) => handleChange(key, type === 'number' ? e.target.value : e.target.value)}
            />
          </div>
        ))}

        {TEXTAREA_FIELDS.map(({ key, label, hint, maxLength }) => (
          <div key={key} className="admin-court-edit-field admin-court-edit-field--full">
            <label htmlFor={`edit-${court.id}-${key}`}>{label}</label>
            <small className="admin-court-edit-hint">{hint}</small>
            <textarea
              id={`edit-${court.id}-${key}`}
              value={form[key] as string}
              maxLength={maxLength}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          </div>
        ))}

        {SELECT_FIELDS.filter(({ key }) => showStatus || key !== 'status').map(({ key, label, options }) => (
          <div key={key} className="admin-court-edit-field">
            <label htmlFor={`edit-${court.id}-${key}`}>{label}</label>
            <select id={`edit-${court.id}-${key}`} value={form[key] as string} onChange={(e) => handleChange(key, e.target.value)}>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}

        <div className="admin-court-edit-field admin-court-edit-field--full">
          <span className="admin-court-edit-field-label">{showActive ? 'Amenities & visibility' : 'Amenities'}</span>
          <div className="admin-court-edit-toggles">
            {TOGGLE_FIELDS.filter(({ key }) => showActive || key !== 'is_active').map(({ key, label }) => (
              <div key={key} className="admin-court-edit-toggle">
                <input
                  type="checkbox"
                  id={`edit-${court.id}-${key}`}
                  checked={form[key] as boolean}
                  onChange={(e) => handleChange(key, e.target.checked)}
                />
                <label htmlFor={`edit-${court.id}-${key}`}>{label}</label>
              </div>
            ))}
          </div>
        </div>
      </div>

      {court.latitude != null && court.longitude != null && Number.isFinite(Number(form.latitude)) && Number.isFinite(Number(form.longitude)) && (
        <div className="admin-court-pin-editor">
          <div><strong>Pin placement</strong><span>Click the map or drag the gold pin to set the precise court location.</span></div>
          <CourtPinCorrectionMap
            compact
            current={{ latitude: court.latitude, longitude: court.longitude }}
            proposed={{ latitude: Number(form.latitude), longitude: Number(form.longitude) }}
            onChange={({ latitude, longitude }) => setForm((prev) => ({ ...prev, latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7)) }))}
          />
        </div>
      )}

      {onPublish ? (
        <div className="admin-court-edit-actions admin-court-edit-actions--publish">
          <span>{changedCount > 0 ? 'Your corrections will be saved as part of publishing.' : 'Publishing makes this draft visible in the court directory.'}</span>
          <button className="btn-cancel" onClick={onCancel} disabled={saving || actionLoading}>{closeLabel}</button>
          {onReject && <button className="btn-reject" onClick={onReject} disabled={saving || actionLoading}>{rejectLabel}</button>}
          <button className="btn-publish" onClick={() => void handlePublish()} disabled={saving || actionLoading}>
            {saving || actionLoading ? <><Loader size={15} className="spinning" /> Publishing…</> : <>{changedCount > 0 ? 'Save & publish court' : 'Publish court'}</>}
          </button>
        </div>
      ) : (
        <div className="admin-court-edit-actions">
          <span>{changedCount > 0 ? 'Review your changes, then save.' : 'Court details are up to date.'}</span>
          <button className="btn-cancel" onClick={onCancel} disabled={saving}>{closeLabel}</button>
          <button className="btn-save" onClick={handleSave} disabled={saving || changedCount === 0}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      )}

      {/* Photos section */}
      <PhotosSection
        courtId={court.id}
        photos={localPhotos}
        onPhotoDeleted={(photoId) => setLocalPhotos((prev) => prev.filter((p) => p.id !== photoId))}
        onPhotoAdded={(photo) => setLocalPhotos((prev) => [photo, ...prev])}
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
 * Thumbnail strip of court photos with drag-and-drop reordering, inline-confirm delete,
 * and photo upload via the existing uploadCourtPhoto API.
 * First photo is the cover photo.
 */
interface PhotosSectionProps {
  courtId: number | string;
  photos: CourtPhoto[];
  onPhotoDeleted: (id: number) => void;
  onPhotoAdded: (photo: CourtPhoto) => void;
  onPhotosReordered: (photos: CourtPhoto[]) => void;
  detailLoading: boolean;
}

function PhotosSection({ courtId, photos, onPhotoDeleted, onPhotoAdded, onPhotosReordered, detailLoading }: PhotosSectionProps) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmIdRef = useRef<number | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Keep ref in sync with state so click handler always reads the latest value.
  // Assignment happens in an effect (not render) per react-hooks/refs; only read
  // from handleDeleteClick, which fires from a later click event, not during render.
  useEffect(() => {
    confirmIdRef.current = confirmId;
  });

  // Clean up confirm timer and preview URL on unmount
  useEffect(() => () => {
    clearTimeout(timerRef.current ?? undefined);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  /** Handle file selection for upload preview. */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadError(null);
  };

  /** Cancel the upload preview and reset file input. */
  const handleCancelPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Upload selected file and prepend new photo to local state. */
  const handleUpload = async () => {
    if (!selectedFile || !courtId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const newPhoto = await uploadCourtPhoto(courtId as number, selectedFile);
      onPhotoAdded(newPhoto);
      handleCancelPreview();
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  /** Execute the delete API call and remove photo from local state. */
  const doDelete = async (photoId: number) => {
    try {
      setDeleteError(null);
      setDeletingId(photoId);
      await adminDeleteCourtPhoto(photoId);
      onPhotoDeleted(photoId);
    } catch (err) {
      console.error('Error deleting photo:', err);
      setDeleteError('Failed to delete photo.');
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * Two-click delete: first click arms confirmation, second click fires delete.
   * Uses a ref for confirmId to avoid stale closure issues with useCallback.
   */
  const handleDeleteClick = (photoId: number) => {
    if (confirmIdRef.current === photoId) {
      clearTimeout(timerRef.current ?? undefined);
      setConfirmId(null);
      doDelete(photoId);
    } else {
      setDeleteError(null);
      setConfirmId(photoId);
      timerRef.current = setTimeout(() => setConfirmId(null), CONFIRM_TIMEOUT_MS);
    }
  };

  /** Reorder on drop: optimistic update, revert on API failure. */
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetIdx: number) => {
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
      await adminReorderCourtPhotos(courtId as number, reordered.map((p) => p.id));
    } catch (err) {
      console.error('Error reordering photos:', err);
      onPhotosReordered(prev);
    }
  };

  return (
    <div className="admin-court-photos">
      <div className="admin-court-photos__header">
        Photos
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {!previewUrl && (
          <button
            className="admin-court-photos__add-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={detailLoading}
            title="Add photo"
          >
            <Camera size={14} /> Add Photo
          </button>
        )}
      </div>

      {/* Upload preview */}
      {previewUrl && (
        <div className="admin-court-photos__upload-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Upload preview" className="admin-court-photos__preview-img" />
          <div className="admin-court-photos__upload-actions">
            <button
              className="admin-court-photos__upload-btn"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? <><Loader size={14} className="spinning" /> Uploading...</> : 'Upload'}
            </button>
            <button
              className="admin-court-photos__cancel-btn"
              onClick={handleCancelPreview}
              disabled={uploading}
            >
              Cancel
            </button>
          </div>
          {uploadError && <p className="admin-court-photos__error">{uploadError}</p>}
        </div>
      )}

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
                onMouseDown={(e) => e.stopPropagation()}
                onDragStart={(e) => e.preventDefault()}
                draggable={false}
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

      {deleteError && (
        <p className="admin-court-photos__error">{deleteError}</p>
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
interface ReviewsSectionProps {
  reviews: CourtReview[];
  onReviewDeleted: (id: number) => void;
  detailLoading: boolean;
}

function ReviewsSection({ reviews, onReviewDeleted, detailLoading }: ReviewsSectionProps) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up confirm timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current ?? undefined), []);

  const doDelete = useCallback(async (reviewId: number) => {
    try {
      setDeletingId(reviewId);
      await adminDeleteReview(reviewId);
      onReviewDeleted(reviewId);
    } catch (err) {
      console.error('Error deleting review:', err);
    } finally {
      setDeletingId(null);
    }
  }, [onReviewDeleted]);

  const handleDeleteClick = useCallback((reviewId: number) => {
    if (confirmId === reviewId) {
      clearTimeout(timerRef.current ?? undefined);
      setConfirmId(null);
      doDelete(reviewId);
    } else {
      setConfirmId(reviewId);
      timerRef.current = setTimeout(() => setConfirmId(null), CONFIRM_TIMEOUT_MS);
    }
  }, [confirmId, doDelete]);

  /** Render star icons for a rating. */
  const renderStars = (rating: number) => {
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
