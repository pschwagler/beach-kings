'use client';

import { useState } from 'react';
import { suggestCourtEdit } from '../../services/api';
import { Button } from '../ui/UI';
import { SURFACE_OPTIONS } from '../../constants/court';
import { Court } from '../../types';
import CourtPinCorrectionMap, { type CourtCoordinates } from './CourtPinCorrectionMap';
import './SuggestEditForm.css';

/**
 * Form for suggesting edits to an existing court.
 * Pre-fills with current court data. Only changed fields are submitted.
 *
 * @param {Object} props
 * @param {Object} props.court - Current court data
 * @param {Function} props.onClose - Close callback
 * @param {Function} props.onSuccess - Success callback
 */
interface SuggestEditFormProps {
  court: Court;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SuggestEditForm({ court, onClose, onSuccess }: SuggestEditFormProps) {
  const [name, setName] = useState(court.name || '');
  const [address, setAddress] = useState(court.address || '');
  const [courtCount, setCourtCount] = useState(court.court_count || '');
  const [surfaceType, setSurfaceType] = useState(court.surface_type || 'sand');
  const [hours, setHours] = useState(court.hours || '');
  const [phone, setPhone] = useState(court.phone || '');
  const [website, setWebsite] = useState(court.website || '');
  const [costInfo, setCostInfo] = useState(court.cost_info || '');
  const [parkingInfo, setParkingInfo] = useState(court.parking_info || '');
  const [description, setDescription] = useState(court.description || '');
  const [windExposure, setWindExposure] = useState(court.wind_exposure || '');
  const [windNotes, setWindNotes] = useState(court.wind_notes || '');
  const [sandDepth, setSandDepth] = useState(court.sand_depth || '');
  const [sandNotes, setSandNotes] = useState(court.sand_notes || '');
  const [isFree, setIsFree] = useState(court.is_free ?? false);
  const [hasLights, setHasLights] = useState(court.has_lights ?? false);
  const [hasRestrooms, setHasRestrooms] = useState(court.has_restrooms ?? false);
  const [hasParking, setHasParking] = useState(court.has_parking ?? false);
  const [netsProvided, setNetsProvided] = useState(court.nets_provided ?? false);
  const [correctingPin, setCorrectingPin] = useState(false);
  const [proposedPin, setProposedPin] = useState<CourtCoordinates | null>(() => (
    court.latitude != null && court.longitude != null
      ? { latitude: court.latitude, longitude: court.longitude }
      : null
  ));
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Build changes object — only include fields that differ from current
    const changes: Record<string, string | number | boolean | null> = {};
    if (name !== (court.name || '')) changes.name = name;
    if (address !== (court.address || '')) changes.address = address;
    if (String(courtCount) !== String(court.court_count || '')) {
      changes.court_count = courtCount ? parseInt(String(courtCount), 10) : null;
    }
    if (surfaceType !== (court.surface_type || 'sand')) changes.surface_type = surfaceType;
    if (hours !== (court.hours || '')) changes.hours = hours || null;
    if (phone !== (court.phone || '')) changes.phone = phone || null;
    if (website !== (court.website || '')) changes.website = website || null;
    if (costInfo !== (court.cost_info || '')) changes.cost_info = costInfo || null;
    if (parkingInfo !== (court.parking_info || '')) changes.parking_info = parkingInfo || null;
    if (description !== (court.description || '')) changes.description = description || null;
    if (windExposure !== (court.wind_exposure || '')) changes.wind_exposure = windExposure || null;
    if (windNotes !== (court.wind_notes || '')) changes.wind_notes = windNotes || null;
    if (sandDepth !== (court.sand_depth || '')) changes.sand_depth = sandDepth || null;
    if (sandNotes !== (court.sand_notes || '')) changes.sand_notes = sandNotes || null;
    if (isFree !== (court.is_free ?? false)) changes.is_free = isFree;
    if (hasLights !== (court.has_lights ?? false)) changes.has_lights = hasLights;
    if (hasRestrooms !== (court.has_restrooms ?? false)) changes.has_restrooms = hasRestrooms;
    if (hasParking !== (court.has_parking ?? false)) changes.has_parking = hasParking;
    if (netsProvided !== (court.nets_provided ?? false)) changes.nets_provided = netsProvided;
    if (correctingPin && proposedPin && court.latitude != null && court.longitude != null) {
      if (proposedPin.latitude !== court.latitude || proposedPin.longitude !== court.longitude) {
        changes.latitude = Number(proposedPin.latitude.toFixed(7));
        changes.longitude = Number(proposedPin.longitude.toFixed(7));
      }
    }

    if (Object.keys(changes).length === 0) {
      setError('No changes detected.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await suggestCourtEdit(court.id as number, changes, correctingPin ? note.trim() : undefined);
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
      <p className="suggest-edit__intro">
        Update what needs correcting. An admin reviews every suggestion before the live court changes.
      </p>

      {error && <p className="court-review-form__error">{error}</p>}

      <div className="court-review-form__field">
        <label htmlFor="suggest-court-name">Court Name</label>
        <input
          id="suggest-court-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      <div className="court-review-form__field">
        <label htmlFor="suggest-court-address">Address</label>
        <input
          id="suggest-court-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div className="court-review-form__field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="suggest-court-count">Courts</label>
          <input
            id="suggest-court-count"
            type="number"
            min="1"
            value={courtCount}
            onChange={(e) => setCourtCount(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
          />
        </div>
        <div className="court-review-form__field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="suggest-surface-type">Surface</label>
          <select
            id="suggest-surface-type"
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

      <fieldset className="suggest-edit__section">
        <legend>Playing conditions</legend>
        <p>Share stable, typical conditions—not today&apos;s weather.</p>
        <div className="suggest-edit__pair">
          <div className="court-review-form__field">
            <label htmlFor="suggest-wind-exposure">Typical wind</label>
            <select id="suggest-wind-exposure" value={windExposure} onChange={(e) => setWindExposure(e.target.value)}>
              <option value="">Unknown</option>
              <option value="sheltered">Sheltered</option>
              <option value="mixed">Mixed</option>
              <option value="exposed">Exposed</option>
            </select>
          </div>
          <div className="court-review-form__field">
            <label htmlFor="suggest-sand-depth">Sand depth</label>
            <select id="suggest-sand-depth" value={sandDepth} onChange={(e) => setSandDepth(e.target.value)}>
              <option value="">Unknown</option>
              <option value="shallow">Shallow</option>
              <option value="typical">Typical</option>
              <option value="deep">Deep</option>
            </select>
          </div>
        </div>
        <div className="suggest-edit__pair">
          <div className="court-review-form__field">
            <label htmlFor="suggest-wind-notes">Wind notes <span>{windNotes.length}/140</span></label>
            <textarea id="suggest-wind-notes" value={windNotes} maxLength={140} rows={2} onChange={(e) => setWindNotes(e.target.value)} placeholder="e.g. Afternoon crosswind is common" />
          </div>
          <div className="court-review-form__field">
            <label htmlFor="suggest-sand-notes">Sand notes <span>{sandNotes.length}/140</span></label>
            <textarea id="suggest-sand-notes" value={sandNotes} maxLength={140} rows={2} onChange={(e) => setSandNotes(e.target.value)} placeholder="e.g. Deep near the net, firmer at baseline" />
          </div>
        </div>
      </fieldset>

      <div className="court-review-form__field">
        <label htmlFor="suggest-hours">Hours</label>
        <input
          id="suggest-hours"
          type="text"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="e.g. Dawn to dusk"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      {court.latitude != null && court.longitude != null && (
        <fieldset className="suggest-edit__section suggest-edit__section--pin">
          <legend>Map pin</legend>
          <label className="suggest-edit__pin-toggle">
            <input type="checkbox" checked={correctingPin} onChange={(e) => setCorrectingPin(e.target.checked)} />
            <span><strong>Fix map pin</strong><small>Suggest a precise court location for admin review.</small></span>
          </label>
          {correctingPin && proposedPin && (
            <div className="suggest-edit__pin-panel">
              <p>Drag the gold pin or click the map to choose the court location. The gray pin shows the current location.</p>
              <CourtPinCorrectionMap
                current={{ latitude: court.latitude, longitude: court.longitude }}
                proposed={proposedPin}
                onChange={setProposedPin}
              />
              <div className="court-review-form__field">
                <label htmlFor="suggest-pin-note">Why should the pin move? <span>{note.length}/280</span></label>
                <textarea id="suggest-pin-note" value={note} maxLength={280} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Courts are north of the parking lot, beside the boardwalk" />
              </div>
            </div>
          )}
        </fieldset>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div className="court-review-form__field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="suggest-phone">Phone</label>
          <input
            id="suggest-phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
          />
        </div>
        <div className="court-review-form__field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="suggest-website">Official site / booking</label>
          <input
            id="suggest-website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
          />
        </div>
      </div>

      <div className="court-review-form__field">
        <label htmlFor="suggest-cost-info">Cost Info</label>
        <input
          id="suggest-cost-info"
          type="text"
          value={costInfo}
          onChange={(e) => setCostInfo(e.target.value)}
          placeholder="e.g. Free, $10/hr"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      <div className="court-review-form__field">
        <label htmlFor="suggest-parking-info">Parking Info</label>
        <input
          id="suggest-parking-info"
          type="text"
          value={parkingInfo}
          onChange={(e) => setParkingInfo(e.target.value)}
          placeholder="e.g. Street parking available"
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px' }}
        />
      </div>

      <div className="court-review-form__field">
        <label htmlFor="suggest-description">About</label>
        <textarea
          id="suggest-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the setting, court setup, and what players should know."
          rows={3}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px', fontSize: '14px', resize: 'vertical' }}
        />
      </div>

      <div className="court-review-form__field">
        <label>Amenities</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
          {([
            ['isFree', 'Free to play', isFree, setIsFree],
            ['hasLights', 'Lights', hasLights, setHasLights],
            ['hasRestrooms', 'Restrooms', hasRestrooms, setHasRestrooms],
            ['hasParking', 'Parking', hasParking, setHasParking],
            ['netsProvided', 'Nets provided', netsProvided, setNetsProvided],
          ] as const).map(([key, label, value, setter]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={value as boolean}
                onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
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
