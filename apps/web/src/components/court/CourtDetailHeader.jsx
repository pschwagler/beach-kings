'use client';

import { MapPin } from 'lucide-react';
import StarRating from '../ui/StarRating';

/**
 * Court detail page header: name, rating, address, badges.
 */
export default function CourtDetailHeader({ court }) {
  const surfaceLabel = {
    sand: 'Sand',
    grass: 'Grass',
    indoor_sand: 'Indoor Sand',
  }[court.surface_type] || court.surface_type;

  return (
    <div className="court-detail__header">
      <h1 className="court-detail__name">{court.name}</h1>

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
        {court.court_count && (
          <span className="court-detail__badge">
            {court.court_count} Court{court.court_count !== 1 ? 's' : ''}
          </span>
        )}
        {surfaceLabel && <span className="court-detail__badge">{surfaceLabel}</span>}
        {court.is_free !== null && court.is_free !== undefined && (
          <span className={`court-detail__badge${court.is_free ? ' court-detail__badge--free' : ''}`}>
            {court.is_free ? 'Free' : 'Paid'}
          </span>
        )}
        {court.has_lights && <span className="court-detail__badge">Lights</span>}
        {court.nets_provided && <span className="court-detail__badge">Nets Provided</span>}
      </div>
    </div>
  );
}
