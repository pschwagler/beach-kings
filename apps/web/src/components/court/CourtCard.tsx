'use client';

import { useRouter } from 'next/navigation';
import { Court } from '../../types';
import Link from 'next/link';
import { Check } from 'lucide-react';
import StarRating from '../ui/StarRating';
import { getSurfaceLabel } from '../../constants/court';
import './CourtCard.css';

/**
 * Court summary card for the directory listing.
 *
 * Displays thumbnail, name, star rating, address, court count, surface type,
 * and top tags. Links to /courts/{slug} detail page by default.
 *
 * When `selectable=true`, renders as a clickable div with check overlay
 * instead of a Link — used inside CourtBrowserModal for court selection.
 *
 * @param {Object} props
 * @param {Object} props.court - Court list item from API
 * @param {boolean} [props.selectable=false] - Render as selectable card instead of link
 * @param {boolean} [props.selected=false] - Whether this card is currently selected
 * @param {(court: Object) => void} [props.onSelect] - Called when selectable card is clicked
 */
interface CourtCardProps {
  court: Court;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (court: Court) => void;
}

export default function CourtCard({ court, selectable = false, selected = false, onSelect }: CourtCardProps) {
  const router = useRouter();
  const {
    slug,
    name,
    address,
    location_name,
    location_slug,
    court_count,
    surface_type,
    average_rating,
    review_count = 0,
    is_free,
    top_tags = [],
    photo_url,
    distance_miles,
  } = court;

  const surfaceLabel = getSurfaceLabel(surface_type);

  const cardClassName = [
    'court-card',
    selectable && 'court-card--selectable',
    selected && 'court-card--selected',
  ].filter(Boolean).join(' ');

  const body = (
    <>
      <div className="court-card__image">
        {photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
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
        {selectable && selected && (
          <div className="court-card__check-overlay">
            <Check size={20} strokeWidth={3} />
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
        {!selectable && location_name && (
          location_slug ? (
            <button
              type="button"
              className="court-card__location court-card__location--link"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/beach-volleyball/${location_slug}`);
              }}
            >
              {location_name}
            </button>
          ) : (
            <p className="court-card__location">{location_name}</p>
          )
        )}

        {distance_miles != null && (
          <p className="court-card__distance">{distance_miles} mi away</p>
        )}

        <div className="court-card__meta">
          {court_count && (
            <span className="court-card__meta-item">
              {court_count} court{court_count !== 1 ? 's' : ''}
            </span>
          )}
          {surfaceLabel && <span className="court-card__meta-item">{surfaceLabel}</span>}
          {is_free === false && (
            <span className="court-card__meta-item">$</span>
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
    </>
  );

  if (selectable) {
    return (
      <div
        className={cardClassName}
        onClick={() => onSelect?.(court)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(court); } }}
        aria-pressed={selected}
      >
        {body}
      </div>
    );
  }

  return (
    <Link href={`/courts/${slug}`} className={cardClassName}>
      {body}
    </Link>
  );
}
