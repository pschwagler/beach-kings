'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Horizontal scrollable photo gallery for court detail page.
 * Supports swipe on mobile and arrow navigation on desktop.
 */
export default function CourtPhotoGallery({ photos = [] }) {
  const scrollRef = useRef(null);

  if (photos.length === 0) return null;

  const scroll = (direction) => {
    if (!scrollRef.current) return;
    const amount = 300;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="court-detail__gallery">
      {photos.length > 2 && (
        <button
          className="court-detail__gallery-nav court-detail__gallery-nav--left"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <div className="court-detail__gallery-scroll" ref={scrollRef}>
        {photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.url}
            alt="Court photo"
            className="court-detail__gallery-img"
            loading="lazy"
          />
        ))}
      </div>

      {photos.length > 2 && (
        <button
          className="court-detail__gallery-nav court-detail__gallery-nav--right"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}
