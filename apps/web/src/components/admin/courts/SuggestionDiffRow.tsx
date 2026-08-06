'use client';

import { useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { resolveCourtEditSuggestion } from '../../../services/api';
import CourtPinCorrectionMap from '../../court/CourtPinCorrectionMap';

const BOOL_FIELDS = new Set([
  'is_free', 'has_lights', 'has_restrooms', 'has_parking', 'nets_provided',
]);

const SURFACE_OPTIONS = [
  { value: '', label: '\u2014' },
  { value: 'sand', label: 'Sand' },
  { value: 'indoor_sand', label: 'Indoor Sand' },
  { value: 'grass', label: 'Grass' },
  { value: 'hard', label: 'Hard Court' },
];

const ENUM_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  surface_type: SURFACE_OPTIONS,
  wind_exposure: [{ value: '', label: 'Unknown' }, { value: 'sheltered', label: 'Sheltered' }, { value: 'mixed', label: 'Mixed' }, { value: 'exposed', label: 'Exposed' }],
  sand_depth: [{ value: '', label: 'Unknown' }, { value: 'shallow', label: 'Shallow' }, { value: 'typical', label: 'Typical' }, { value: 'deep', label: 'Deep' }],
};

/**
 * Humanize a snake_case field name into a label.
 */
function labelFor(key: string) {
  if (key === 'description') return 'About';
  if (key === 'map_pin') return 'Map pin';
  if (key === 'wind_exposure') return 'Typical wind';
  if (key === 'sand_depth') return 'Sand depth';
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format a value for display (current column).
 */
function displayValue(val: unknown) {
  if (val === null || val === undefined || val === '') return '\u2014';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

/**
 * Expandable diff panel for a single edit suggestion.
 *
 * Shows current vs proposed values per changed field. Admin can cherry-pick
 * fields, edit proposed values, then apply selected or reject all.
 */
interface Suggestion {
  id: number;
  court_id: number;
  changes?: Record<string, unknown>;
  current?: Record<string, unknown>;
  suggester_name?: string;
  created_at?: string;
  note?: string | null;
}

function distanceMeters(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(toLat - fromLat);
  const dLng = radians(toLng - fromLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface SuggestionDiffRowProps {
  suggestion: Suggestion;
  onResolved?: (id: number) => void;
}

export default function SuggestionDiffRow({ suggestion, onResolved }: SuggestionDiffRowProps) {
  const { changes, current, id: suggestionId } = suggestion;
  const changedKeys = Object.keys(changes || {});
  const hasPinChange = changedKeys.includes('latitude') && changedKeys.includes('longitude');
  const reviewKeys = [...changedKeys.filter((key) => key !== 'latitude' && key !== 'longitude'), ...(hasPinChange ? ['map_pin'] : [])];

  // Track which fields are selected (checked)
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(reviewKeys.map((k) => [k, true]))
  );

  // Track editable proposed values (pre-filled from suggestion)
  const [proposed, setProposed] = useState(() =>
    Object.fromEntries(changedKeys.map((k) => [k, changes?.[k]]))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  const toggleField = (key: string) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateProposed = (key: string, value: unknown) => {
    setProposed((prev) => ({ ...prev, [key]: value }));
  };

  /** Resolve and apply selected fields atomically on the server. */
  const handleApply = async () => {
    const selectedFields: Record<string, unknown> = {};
    let allSelectedAndUnmodified = true;

    for (const key of reviewKeys) {
      if (selected[key]) {
        if (key === 'map_pin') {
          selectedFields.latitude = proposed.latitude;
          selectedFields.longitude = proposed.longitude;
          if (proposed.latitude !== changes?.latitude || proposed.longitude !== changes?.longitude) allSelectedAndUnmodified = false;
        } else {
          selectedFields[key] = proposed[key];
          if (proposed[key] !== changes?.[key]) allSelectedAndUnmodified = false;
        }
      } else {
        allSelectedAndUnmodified = false;
      }
    }

    if (Object.keys(selectedFields).length === 0) {
      setError('Select at least one field to apply.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (allSelectedAndUnmodified) {
        await resolveCourtEditSuggestion(suggestionId, 'approved');
      } else {
        await resolveCourtEditSuggestion(suggestionId, 'partially_applied', {
          applied_changes: selectedFields,
        });
      }

      onResolved?.(suggestionId);
    } catch (err) {
      console.error('Error applying suggestion:', err);
      setError(err.response?.data?.detail || 'Failed to apply suggestion.');
    } finally {
      setSaving(false);
    }
  };

  /** Reject all — just mark as rejected. */
  const handleReject = async () => {
    if (!confirmReject) {
      setConfirmReject(true);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await resolveCourtEditSuggestion(suggestionId, 'rejected');
      onResolved?.(suggestionId);
    } catch (err) {
      console.error('Error rejecting suggestion:', err);
      setError(err.response?.data?.detail || 'Failed to reject suggestion.');
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = reviewKeys.filter((key) => selected[key]).length;

  /** Render the input control for a proposed value. */
  const renderInput = (key: string, value: unknown, disabled: boolean) => {
    if (BOOL_FIELDS.has(key)) {
      return (
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={(e) => updateProposed(key, e.target.checked)}
          className="suggestion-diff__checkbox-input"
        />
      );
    }
    if (ENUM_OPTIONS[key]) {
      return (
        <select
          value={(value as string) || ''}
          disabled={disabled}
          onChange={(e) => updateProposed(key, e.target.value)}
          className="suggestion-diff__select"
        >
          {ENUM_OPTIONS[key].map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    if (key === 'court_count') {
      return (
        <input
          type="number"
          value={(value as number | string | undefined) ?? ''}
          disabled={disabled}
          onChange={(e) => updateProposed(key, e.target.value === '' ? null : Number(e.target.value))}
          className="suggestion-diff__input"
          min={0}
        />
      );
    }
    if (key === 'description' || key === 'wind_notes' || key === 'sand_notes') {
      return (
        <textarea
          value={(value as string) ?? ''}
          disabled={disabled}
          onChange={(e) => updateProposed(key, e.target.value)}
          className="suggestion-diff__input suggestion-diff__textarea"
          rows={3}
          maxLength={key === 'description' ? undefined : 140}
        />
      );
    }
    return (
      <input
        type="text"
        value={(value as string) ?? ''}
        disabled={disabled}
        onChange={(e) => updateProposed(key, e.target.value)}
        className="suggestion-diff__input"
      />
    );
  };

  return (
    <div className="suggestion-diff" onClick={(e) => e.stopPropagation()}>
      <div className="suggestion-diff__meta">
        Suggested by: <strong>{suggestion.suggester_name || 'Unknown'}</strong>
        <span className="suggestion-diff__meta-sep">&middot;</span>
        {suggestion.created_at
          ? new Date(suggestion.created_at).toLocaleDateString()
          : 'N/A'}
      </div>

      {suggestion.note && (
        <div className="suggestion-diff__note"><strong>Submitter note</strong><p>{suggestion.note}</p></div>
      )}

      {error && <div className="error-message suggestion-diff__error" role="alert">{error}</div>}

      <div className="suggestion-diff__legend" aria-hidden="true">
        <span>Use</span><span>Field</span><span>Current value</span><span></span><span>Proposed value</span>
      </div>

      <div className="suggestion-diff__fields">
        {hasPinChange && (() => {
          const currentLat = Number(current?.latitude);
          const currentLng = Number(current?.longitude);
          const proposedLat = Number(proposed.latitude);
          const proposedLng = Number(proposed.longitude);
          const validCoordinates = [currentLat, currentLng, proposedLat, proposedLng].every(Number.isFinite);
          const moveDistance = validCoordinates ? distanceMeters(currentLat, currentLng, proposedLat, proposedLng) : null;
          const checked = selected.map_pin;
          return (
            <div key="map_pin" className={`suggestion-diff__pin ${!checked ? 'suggestion-diff__row--dimmed' : ''}`}>
              <div className="suggestion-diff__pin-heading">
                <input type="checkbox" checked={checked} onChange={() => toggleField('map_pin')} aria-label={`${checked ? 'Exclude' : 'Include'} Map pin`} />
                <div><strong>Map pin</strong><span>Pin placement is applied as one change.</span></div>
                {moveDistance != null && <b className={moveDistance > 500 ? 'suggestion-diff__move-warning' : ''}>{moveDistance < 1000 ? `${Math.round(moveDistance)} m move` : `${(moveDistance / 1000).toFixed(1)} km move`}</b>}
              </div>
              {moveDistance != null && moveDistance > 500 && <p className="suggestion-diff__warning">Large move: verify this still points to the same venue before applying.</p>}
              {validCoordinates && (
                <CourtPinCorrectionMap
                  compact
                  current={{ latitude: currentLat, longitude: currentLng }}
                  proposed={{ latitude: proposedLat, longitude: proposedLng }}
                  onChange={checked ? ({ latitude, longitude }) => setProposed((prev) => ({ ...prev, latitude: Number(latitude.toFixed(7)), longitude: Number(longitude.toFixed(7)) })) : undefined}
                />
              )}
            </div>
          );
        })()}
        {reviewKeys.filter((key) => key !== 'map_pin').map((key) => {
          const isChecked = selected[key];
          return (
            <div
              key={key}
              className={`suggestion-diff__row ${!isChecked ? 'suggestion-diff__row--dimmed' : ''}`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleField(key)}
                className="suggestion-diff__toggle"
                aria-label={`${isChecked ? 'Exclude' : 'Include'} ${labelFor(key)}`}
              />
              <span className="suggestion-diff__label">{labelFor(key)}</span>
              <span className="suggestion-diff__current">
                {displayValue(current?.[key])}
              </span>
              <span className="suggestion-diff__arrow"><ArrowRight size={15} /></span>
              <div className="suggestion-diff__proposed">
                {renderInput(key, proposed[key], !isChecked)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="suggestion-diff__actions">
        <span>{selectedCount} of {reviewKeys.length} {reviewKeys.length === 1 ? 'change' : 'changes'} selected</span>
        <button
          className="btn-cancel"
          onClick={() => void handleReject()}
          disabled={saving}
        >
          <X size={15} /> {confirmReject ? 'Confirm rejection' : 'Reject request'}
        </button>
        <button
          className="btn-save"
          onClick={() => void handleApply()}
          disabled={saving || selectedCount === 0}
        >
          <Check size={15} /> {saving ? 'Updating live court…' : selectedCount === reviewKeys.length ? 'Approve & update live court' : `Apply ${selectedCount} to live court`}
        </button>
      </div>
    </div>
  );
}
