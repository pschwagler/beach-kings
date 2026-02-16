'use client';

import Link from 'next/link';
import StarRating from '../ui/StarRating';
import './CourtCard.css';

/**
 * Court summary card for the directory listing.
 *
 * Displays thumbnail, name, star rating, address, court count, surface type,
 * and top tags. Links to /courts/{slug} detail page.
 *
 * @param {Object} props
 * @param {Object} props.court - Court list item from API
 */
export default function CourtCard({ court }) {
  const {
    slug,
    name,
    address,
    court_count,
    surface_type,
    average_rating,
    review_count = 0,
    is_free,
    top_tags = [],
    photo_url,
  } = court;

  const surfaceLabel = {
    sand: 'Sand',
    grass: 'Grass',
    indoor_sand: 'Indoor Sand',
  }[surface_type] || surface_type;

  return (
    <Link href={`/courts/${slug}`} className="court-card">
      <div className="court-card__image">
        {photo_url ? (
          <img src={photo_url} alt={name} loading="lazy" />
        ) : (
          <div className="court-card__placeholder">
            <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 36c2-8 8-14 12-14s10 6 12 14" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="24" cy="18" r="4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
        )}
      </div>

      <div className="court-card__body">
        <h3 className="court-card__name">{name}</h3>

        <div className="court-card__rating">
          {review_count > 0 ? (
            <>
              <StarRating value={average_rating || 0} size={14} />
              <span className="court-card__review-count">({review_count})</span>
            </>
          ) : (
            <span className="court-card__new-badge">New</span>
          )}
        </div>

        {address && <p className="court-card__address">{address}</p>}

        <div className="court-card__meta">
          {court_count && (
            <span className="court-card__meta-item">
              {court_count} court{court_count !== 1 ? 's' : ''}
            </span>
          )}
          {surfaceLabel && <span className="court-card__meta-item">{surfaceLabel}</span>}
          {is_free !== null && is_free !== undefined && (
            <span className="court-card__meta-item">{is_free ? 'Free' : 'Paid'}</span>
          )}
        </div>

        {top_tags.length > 0 && (
          <div className="court-card__tags">
            {top_tags.slice(0, 3).map((tag) => (
              <span key={tag} className="court-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
