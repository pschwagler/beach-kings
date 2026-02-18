'use client';

import { useRouter } from 'next/navigation';

/**
 * Photo mosaic gallery for court detail page.
 * Shows 1 large photo left (spans 2 rows) + up to 4 small photos in a 2x2 grid right.
 * "See all X photos" overlay on the last visible photo if there are more than 5.
 * Clicking navigates to the full photos page.
 */
export default function CourtPhotoGallery({ photos = [], slug }) {
  const router = useRouter();

  if (photos.length === 0) return null;

  const handleClick = () => {
    router.push(`/courts/${slug}/photos`);
  };

  const displayPhotos = photos.slice(0, 5);
  const hasMore = photos.length > 5;
  const remainingCount = photos.length - 4; // Show count on the 5th photo slot

  return (
    <div className="court-detail__mosaic" onClick={handleClick} role="button" tabIndex={0}>
      {/* Large photo (left, spans 2 rows) */}
      <div className="court-detail__mosaic-main">
        <img
          src={displayPhotos[0].url}
          alt="Court photo"
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
            key={photo.id}
            className={`court-detail__mosaic-cell${index === 1 ? ' court-detail__mosaic-cell--tr' : ''}${index === 3 ? ' court-detail__mosaic-cell--br' : ''}`}
          >
            <img
              src={photo.url}
              alt="Court photo"
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
