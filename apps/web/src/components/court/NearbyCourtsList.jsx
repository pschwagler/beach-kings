'use client';

import Link from 'next/link';
import StarRating from '../ui/StarRating';

/**
 * Horizontal scrollable list of nearby courts at the bottom of court detail page.
 */
export default function NearbyCourtsList({ courts }) {
  if (!courts?.length) return null;

  return (
    <div className="court-detail__nearby">
      <h2 className="court-detail__section-title">Nearby Courts</h2>
      <div className="court-detail__nearby-scroll">
        {courts.map((court) => (
          <Link
            key={court.id}
            href={`/courts/${court.slug}`}
            className="court-detail__nearby-card"
          >
            <h3>{court.name}</h3>
            <div className="court-detail__nearby-meta">
              {court.review_count > 0 ? (
                <StarRating value={court.average_rating || 0} size={12} />
              ) : (
                <span className="court-detail__nearby-new">New</span>
              )}
              <span>{court.distance_miles} mi</span>
            </div>
            {court.address && <p>{court.address}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
