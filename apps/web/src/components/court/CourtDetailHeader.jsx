'use client';

import { MapPin, Pencil, Bookmark } from 'lucide-react';
import StarRating from '../ui/StarRating';
import { getSurfaceLabel } from '../../constants/court';

/**
 * Court detail page header: name, rating, address, badges, action icons.
 */
export default function CourtDetailHeader({ court, onSuggestEdit }) {
  const surfaceLabel = getSurfaceLabel(court.surface_type);

  return (
    <div className="court-detail__header">
      <div className="court-detail__header-top">
        <h1 className="court-detail__name">{court.name}</h1>
        <div className="court-detail__header-actions">
          {onSuggestEdit && (
            <button
              className="court-detail__header-action"
              onClick={onSuggestEdit}
              aria-label="Suggest an edit"
              title="Suggest an edit"
            >
              <Pencil size={18} />
            </button>
          )}
          <button
            className="court-detail__header-action"
            aria-label="Bookmark court"
            title="Bookmark"
          >
            <Bookmark size={18} />
          </button>
        </div>
      </div>

      <div className="court-detail__rating-row">
        {court.review_count > 0 ? (
          <>
            <StarRating value={court.average_rating || 0} size={20} showValue />
            <span className="court-detail__review-count">
              ({court.review_count} review{court.review_count !== 1 ? 's' : ''})
            </span>
          </>
        ) : (
          <span className="court-detail__new-badge">New - No reviews yet</span>
        )}
      </div>

      {court.address && (
        <p className="court-detail__address">
          <MapPin size={14} /> {court.address}
        </p>
      )}

      <div className="court-detail__badges">
        {court.court_count > 0 && (
          <span className="court-detail__badge">
            {court.court_count} Court{court.court_count !== 1 ? 's' : ''}
          </span>
        )}
        {surfaceLabel && <span className="court-detail__badge">{surfaceLabel}</span>}
        {court.is_free === false && (
          <span className="court-detail__badge">$</span>
        )}
        {court.has_lights && <span className="court-detail__badge">Lights</span>}
        {court.nets_provided && <span className="court-detail__badge">Nets Provided</span>}
      </div>
    </div>
  );
}
