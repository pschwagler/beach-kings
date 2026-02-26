'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

/**
 * StatCard — Reusable stat display card with optional delta and subtitle.
 *
 * @param {React.ComponentType} icon - Icon component (lucide or custom; receives size + className)
 * @param {string} label - Stat label text
 * @param {string|number} value - Display value
 * @param {string} [subtitle] - Optional secondary line below value (e.g. "1,423 Peak Rating")
 * @param {Object} [delta] - Optional period-over-period change indicator
 * @param {string} delta.label - Formatted change text (e.g. "+25", "-3.1%")
 * @param {'up'|'down'|'neutral'} delta.direction - Controls color (green/red/gray)
 * @param {string} [className] - Additional className on the root element
 */
export default function StatCard({ icon: Icon, label, value, subtitle, delta, className }) {
  return (
    <div className={`overview-stat-card${className ? ` ${className}` : ''}`}>
      {Icon && <Icon size={20} className="overview-stat-card__icon" />}
      <div className="overview-stat-card__label">{label}</div>
      <div className="overview-stat-card__value">{value}</div>
      {subtitle && (
        <div className="overview-stat-card__subtitle">{subtitle}</div>
      )}
      {delta && (
        <div className={`overview-stat-card__delta overview-stat-card__delta--${delta.direction}`}>
          {delta.direction === 'up' && <TrendingUp size={12} />}
          {delta.direction === 'down' && <TrendingDown size={12} />}
          <span>{delta.label}</span>
        </div>
      )}
    </div>
  );
}
