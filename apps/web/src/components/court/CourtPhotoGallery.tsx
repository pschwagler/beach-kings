'use client';

import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';

/**
 * Photo mosaic gallery for court detail page.
 * Shows 1 large photo left (spans 2 rows) + up to 4 small photos in a 2x2 grid right.
 * "See all X photos" overlay on the last visible photo if there are more than 5.
 * Clicking navigates to the full photos page.
 * When no photos exist, renders an empty-state CTA linking to the photos page.
 */
interface CourtPhoto {
  url: string;
  id?: number;
}

interface CourtPhotoGalleryProps {
  photos?: CourtPhoto[];
  slug: string;
}

export default function CourtPhotoGallery({ photos = [], slug }: CourtPhotoGalleryProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/courts/${slug}/photos`);
  };

  if (photos.length === 0) {
    return (
      <div
        className="court-detail__mosaic-empty"
        onClick={handleClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
        role="button"
        tabIndex={0}
        aria-label="Add the first court photo"
      >
        <Camera size={32} className="court-detail__mosaic-empty-icon" />
        <span className="court-detail__mosaic-empty-text">Be the first to add a photo</span>
      </div>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const displayPhotos = photos.slice(0, 5);
  const hasMore = photos.length > 5;

  return (
    <div className="court-detail__mosaic" onClick={handleClick} onKeyDown={handleKeyDown} role="button" tabIndex={0} aria-label={`View all ${photos.length} court photos`}>
      {/* Large photo (left, spans 2 rows) */}
      <div className="court-detail__mosaic-main">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayPhotos[0].url}
          alt={`Court photo 1 of ${photos.length}`}
          className="court-detail__mosaic-img"
          loading="eager"
        />
      </div>

      {/* Up to 4 smaller photos in 2x2 grid */}
      {displayPhotos.slice(1).map((photo, index) => {
        const isLast = index === displayPhotos.length - 2;
        const showOverlay = isLast && hasMore;

        return (
          <div
            key={photo.url}
            className={`court-detail__mosaic-cell${index === 1 ? ' court-detail__mosaic-cell--tr' : ''}${index === 3 ? ' court-detail__mosaic-cell--br' : ''}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={`Court photo ${index + 2} of ${photos.length}`}
              className="court-detail__mosaic-img"
              loading="lazy"
            />
            {showOverlay && (
              <div className="court-detail__mosaic-overlay">
                See all {photos.length} photos
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
