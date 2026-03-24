'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import './ImageLightbox.css';

interface LightboxPhoto {
  id: string | number;
  url: string;
}

interface ImageLightboxProps {
  photos: LightboxPhoto[];
  startIndex?: number;
  onClose: () => void;
}

/**
 * Fullscreen image lightbox with keyboard and swipe navigation.
 *
 * @param {Object[]} photos - Array of { id, url } objects
 * @param {number}   startIndex - Initial photo index to display
 * @param {Function} onClose - Called when lightbox is dismissed
 */
export default function ImageLightbox({ photos, startIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const total = photos.length;
  const photo = photos[index];

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + total) % total);
  }, [total]);

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % total);
  }, [total]);

  /* Keyboard navigation */
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, goPrev, goNext]);

  /* Lock body scroll while open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Swipe detection */
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const SWIPE_THRESHOLD = 50;
    if (dx > SWIPE_THRESHOLD) goPrev();
    else if (dx < -SWIPE_THRESHOLD) goNext();
    touchStartX.current = null;
  };

  /* Close on backdrop click (not on image/buttons) */
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  if (!photo) return null;

  return (
    <div
      className="image-lightbox__overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <img src={photo.url} alt="" className="image-lightbox__img" />

      <button className="image-lightbox__close" onClick={onClose} aria-label="Close lightbox">
        <X size={20} />
      </button>

      {total > 1 && (
        <>
          <button className="image-lightbox__nav image-lightbox__nav--prev" onClick={goPrev} aria-label="Previous photo">
            <ChevronLeft size={22} />
          </button>
          <button className="image-lightbox__nav image-lightbox__nav--next" onClick={goNext} aria-label="Next photo">
            <ChevronRight size={22} />
          </button>
          <div className="image-lightbox__counter">
            {index + 1} of {total}
          </div>
        </>
      )}
    </div>
  );
}
