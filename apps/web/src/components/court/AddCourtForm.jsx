'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { submitCourt, getPublicLocations } from '../../services/api';
import { Button } from '../ui/UI';
import Toast from '../ui/Toast';
import { SURFACE_OPTIONS } from '../../constants/court';
import './AddCourtForm.css';

/**
 * Multi-field form for submitting a new court for admin approval.
 *
 * @param {Object} props
 * @param {function} props.onClose - Close the form
 * @param {function} props.onSuccess - Called after successful submission
 */
export default function AddCourtForm({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: '',
    address: '',
    location_id: '',
    description: '',
    court_count: '',
    surface_type: 'sand',
    is_free: true,
    cost_info: '',
    has_lights: false,
    has_restrooms: false,
    has_parking: false,
    parking_info: '',
    nets_provided: false,
    hours: '',
    website: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    getPublicLocations()
      .then((regions) => {
        const locs = [];
        (regions || []).forEach((region) => {
          (region.locations || []).forEach((loc) => {
            locs.push({ id: loc.id, name: loc.name });
          });
        });
        setLocations(locs);
      })
      .catch(() => {});
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.address.trim() || !form.location_id) {
      setToast({ type: 'error', message: 'Name, address, and location are required.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        court_count: form.court_count ? parseInt(form.court_count, 10) : null,
        cost_info: form.cost_info || null,
        parking_info: form.parking_info || null,
        hours: form.hours || null,
        website: form.website || null,
        phone: form.phone || null,
        description: form.description || null,
      };
      await submitCourt(payload);
      setToast({ type: 'success', message: 'Court submitted for review!' });
      setTimeout(() => onSuccess?.(), 1500);
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.detail || 'Failed to submit court.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="add-court-form">
      <div className="add-court-form__header">
        <h2>Add a Court</h2>
        <button className="add-court-form__close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <p className="add-court-form__info">
        Your submission will be reviewed by an admin before appearing in the directory.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="add-court-form__grid">
          <div className="add-court-form__field add-court-form__field--full">
            <label>Court Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Manhattan Beach Courts"
              required
            />
          </div>

          <div className="add-court-form__field add-court-form__field--full">
            <label>Address *</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Full street address"
              required
            />
          </div>

          <div className="add-court-form__field">
            <label>Location Hub *</label>
            <select
              value={form.location_id}
              onChange={(e) => handleChange('location_id', e.target.value)}
              required
            >
              <option value="">Select location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          <div className="add-court-form__field">
            <label>Number of Courts</label>
            <input
              type="number"
              min="1"
              max="50"
              value={form.court_count}
              onChange={(e) => handleChange('court_count', e.target.value)}
              placeholder="e.g., 3"
            />
          </div>

          <div className="add-court-form__field">
            <label>Surface Type</label>
            <select
              value={form.surface_type}
              onChange={(e) => handleChange('surface_type', e.target.value)}
            >
              {SURFACE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="add-court-form__field add-court-form__field--full">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Describe the courts..."
              rows={3}
            />
          </div>

          <div className="add-court-form__amenities">
            <label className="add-court-form__amenity-label">Amenities</label>
            <div className="add-court-form__checkboxes">
              {[
                ['is_free', 'Free to play'],
                ['has_lights', 'Lights'],
                ['has_restrooms', 'Restrooms'],
                ['has_parking', 'Parking'],
                ['nets_provided', 'Nets provided'],
              ].map(([key, label]) => (
                <label key={key} className="add-court-form__checkbox">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => handleChange(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="add-court-form__field">
            <label>Hours</label>
            <input
              type="text"
              value={form.hours}
              onChange={(e) => handleChange('hours', e.target.value)}
              placeholder="e.g., Dawn to dusk"
            />
          </div>

          <div className="add-court-form__field">
            <label>Website</label>
            <input
              type="url"
              value={form.website}
              onChange={(e) => handleChange('website', e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="add-court-form__field">
            <label>Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
        </div>

        <div className="add-court-form__actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Court'}
          </Button>
        </div>
      </form>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
