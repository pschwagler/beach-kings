'use client';

import { useState } from 'react';
import { suggestCourtEdit } from '../../services/api';
import { Button } from '../ui/UI';

const SURFACE_OPTIONS = [
  { value: 'sand', label: 'Sand' },
  { value: 'grass', label: 'Grass' },
  { value: 'indoor_sand', label: 'Indoor Sand' },
];

/**
 * Form for suggesting edits to an existing court.
 * Pre-fills with current court data. Only changed fields are submitted.
 *
 * @param {Object} props
 * @param {Object} props.court - Current court data
 * @param {Function} props.onClose - Close callback
 * @param {Function} props.onSuccess - Success callback
 */
export default function SuggestEditForm({ court, onClose, onSuccess }) {
  const [name, setName] = useState(court.name || '');
  const [address, setAddress] = useState(court.address || '');
  const [courtCount, setCourtCount] = useState(court.court_count || '');
  const [surfaceType, setSurfaceType] = useState(court.surface_type || 'sand');
  const [hours, setHours] = useState(court.hours || '');
  const [phone, setPhone] = useState(court.phone || '');
  const [website, setWebsite] = useState(court.website || '');
  const [costInfo, setCostInfo] = useState(court.cost_info || '');
  const [parkingInfo, setParkingInfo] = useState(court.parking_info || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Build changes object — only include fields that differ from current
    const changes = {};
    if (name !== (court.name || '')) changes.name = name;
    if (address !== (court.address || '')) changes.address = address;
    if (String(courtCount) !== String(court.court_count || '')) {
      changes.court_count = courtCount ? parseInt(courtCount, 10) : null;
    }
    if (surfaceType !== (court.surface_type || 'sand')) changes.surface_type = surfaceType;
    if (hours !== (court.hours || '')) changes.hours = hours || null;
    if (phone !== (court.phone || '')) changes.phone = phone || null;
    if (website !== (court.website || '')) changes.website = website || null;
    if (costInfo !== (court.cost_info || '')) changes.cost_info = costInfo || null;
    if (parkingInfo !== (court.parking_info || '')) changes.parking_info = parkingInfo || null;

    if (Object.keys(changes).length === 0) {
      setError('No changes detected.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await suggestCourtEdit(court.id, changes);
      onSuccess?.();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to submit suggestion.';
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="court-review-form" onSubmit={handleSubmit}>
      <h3 className="court-review-form__title">Suggest an Edit</h3>
      <p style={{ fontSize: '13px', color: 'var(--gray-600)', margin: '0 0 16px' }}>
        Update any fields that need correction. Only changed fields will be submitted for review.
      </p>

      {error && <p className="court-review-form__error">{error}</p>}

      <div className="court-review-form__field">
        <label>Court Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      <div className="court-review-form__field">
        <label>Address</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div className="court-review-form__field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Courts</label>
          <input
            type="number"
            min="1"
            value={courtCount}
            onChange={(e) => setCourtCount(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
          />
        </div>
        <div className="court-review-form__field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Surface</label>
          <select
            value={surfaceType}
            onChange={(e) => setSurfaceType(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
          >
            {SURFACE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="court-review-form__field">
        <label>Hours</label>
        <input
          type="text"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="e.g. Dawn to dusk"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div className="court-review-form__field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Phone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
          />
        </div>
        <div className="court-review-form__field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Website</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
          />
        </div>
      </div>

      <div className="court-review-form__field">
        <label>Cost Info</label>
        <input
          type="text"
          value={costInfo}
          onChange={(e) => setCostInfo(e.target.value)}
          placeholder="e.g. Free, $10/hr"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      <div className="court-review-form__field">
        <label>Parking Info</label>
        <input
          type="text"
          value={parkingInfo}
          onChange={(e) => setParkingInfo(e.target.value)}
          placeholder="e.g. Street parking available"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      <div className="court-review-form__actions">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Suggestion'}
        </Button>
      </div>
    </form>
  );
}
