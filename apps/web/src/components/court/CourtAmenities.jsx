'use client';

import {
  Lightbulb,
  ParkingCircle,
  Bath,
  Network,
  DollarSign,
} from 'lucide-react';

const AMENITY_CONFIG = [
  { key: 'has_lights', label: 'Lights', icon: Lightbulb },
  { key: 'has_restrooms', label: 'Restrooms', icon: Bath },
  { key: 'has_parking', label: 'Parking', icon: ParkingCircle },
  { key: 'nets_provided', label: 'Nets Provided', icon: Network },
  { key: 'is_free', label: 'Free', icon: DollarSign },
];

/**
 * Amenities icon grid for court detail page.
 */
export default function CourtAmenities({ court }) {
  const amenities = AMENITY_CONFIG.filter((a) => court[a.key] === true);
  if (amenities.length === 0) return null;

  return (
    <div className="court-detail__amenities">
      <h2 className="court-detail__section-title">Amenities</h2>
      <div className="court-detail__amenities-grid">
        {amenities.map(({ key, label, icon: Icon }) => (
          <div key={key} className="court-detail__amenity">
            <Icon size={20} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
