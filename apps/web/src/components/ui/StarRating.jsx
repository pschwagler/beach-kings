'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import './StarRating.css';

/**
 * Reusable star rating component.
 *
 * Display mode: shows filled/half/empty stars for an average rating.
 * Interactive mode: lets users click to set a 1-5 rating.
 *
 * @param {Object} props
 * @param {number} [props.value=0] - Current rating value (1-5 or decimal for display)
 * @param {function} [props.onChange] - Callback when rating changes (enables interactive mode)
 * @param {number} [props.size=18] - Star icon size in pixels
 * @param {boolean} [props.showValue=false] - Show numeric value next to stars
 * @param {string} [props.className] - Additional CSS class
 */
export default function StarRating({ value = 0, onChange, size = 18, showValue = false, className = '' }) {
  const [hoverValue, setHoverValue] = useState(0);
  const interactive = typeof onChange === 'function';
  const displayValue = interactive && hoverValue > 0 ? hoverValue : value;

  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const diff = displayValue - i + 1;
    let fill = 'empty';
    if (diff >= 1) fill = 'full';
    else if (diff >= 0.25) fill = 'half';

    stars.push(
      <span
        key={i}
        className={`star-rating__star star-rating__star--${fill}${interactive ? ' star-rating__star--interactive' : ''}`}
        onClick={interactive ? () => onChange(i) : undefined}
        onMouseEnter={interactive ? () => setHoverValue(i) : undefined}
        onMouseLeave={interactive ? () => setHoverValue(0) : undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onChange(i); } : undefined}
        aria-label={interactive ? `Rate ${i} star${i > 1 ? 's' : ''}` : undefined}
      >
        {fill === 'half' ? (
          <span className="star-rating__half-wrapper" style={{ width: size, height: size }}>
            <Star size={size} className="star-rating__icon star-rating__icon--bg" />
            <span className="star-rating__half-clip">
              <Star size={size} className="star-rating__icon star-rating__icon--filled" />
            </span>
          </span>
        ) : (
          <Star size={size} className="star-rating__icon" />
        )}
      </span>
    );
  }

  return (
    <span className={`star-rating ${className}`} aria-label={`Rating: ${value} out of 5`}>
      {stars}
      {showValue && value > 0 && (
        <span className="star-rating__value">{value.toFixed(1)}</span>
      )}
    </span>
  );
}
