'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, ChevronDown, Search, Ban, Star, Plus } from 'lucide-react';
import CourtBrowserModal from './CourtBrowserModal';
import { getPlaceholderCourt } from '../../services/api';
import { Court } from '../../types';
import './CourtSelector.css';

interface CourtOption {
  id: number | string;
  name?: string;
  address?: string;
}

/**
 * Court selection dropdown for forms and home court management.
 *
 * Supports two modes:
 * - `single` (default): Select one court. Used in scheduling/league creation.
 * - `multi`: Manage a list of courts with add/remove/set-primary. Used for home courts.
 *
 * Single-mode props:
 * @param {number|null} props.value - Selected court_id or null
 * @param {(courtId: number|null) => void} props.onChange - Called with court_id or null
 *
 * Multi-mode props:
 * @param {Array<{id: number, name: string, address?: string}>} props.selectedCourts - Currently selected courts
 * @param {(courts: Array<{id, name, address}>) => void} props.onSet - Called with the full new list of courts
 * @param {(courtId: number) => void} props.onRemove - Called when a court is removed
 * @param {(courtId: number) => void} [props.onSetPrimary] - Called to set a court as primary (optional)
 *
 * Common props:
 * @param {'single'|'multi'} [props.mode='single'] - Selection mode
 * @param {Array<{id: number, name: string, address?: string}>} [props.homeCourts=[]] - Home courts for quick picks (single mode)
 * @param {string} [props.preFilterLocationId] - Pre-filter browser modal to location
 * @param {string} [props.label] - Form label text
 * @param {boolean} [props.required=false] - Whether the field is required
 */
interface CourtSelectorProps {
  mode?: 'single' | 'multi';
  value?: number | null;
  valueName?: string | null;
  onChange?: (courtId: number | null) => void;
  homeCourts?: CourtOption[];
  selectedCourts?: CourtOption[];
  onSet?: (courts: CourtOption[]) => void;
  onRemove?: (courtId: number) => void;
  onSetPrimary?: (courtId: number) => void;
  preFilterLocationId?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function CourtSelector({
  mode = 'single',
  // Single-mode
  value = null,
  valueName = null,
  onChange,
  homeCourts = [],
  // Multi-mode
  selectedCourts = [],
  onSet,
  onRemove,
  onSetPrimary,
  // Common
  preFilterLocationId,
  label,
  required = false,
  disabled = false,
}: CourtSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  // Track courts selected from browser that aren't home courts (single mode)
  const [browsedCourt, setBrowsedCourt] = useState<CourtOption | null>(null);
  const [openUpward, setOpenUpward] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Placeholder court for "Other / Private Court"
  const [placeholderCourt, setPlaceholderCourt] = useState<Court | null>(null);

  // Fetch placeholder court when location context is available
  useEffect(() => {
    if (!preFilterLocationId) return;
    let cancelled = false;
    getPlaceholderCourt(preFilterLocationId)
      .then((data) => { if (!cancelled) setPlaceholderCourt(data); })
      .catch(() => { /* no placeholder for this location — hide option */ });
    return () => { cancelled = true; };
  }, [preFilterLocationId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  /** Determine if dropdown should open upward (not enough space below). */
  const checkDropdownDirection = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenUpward(spaceBelow < 200);
  }, []);

  // ── Helpers ──

  const isPlaceholder = placeholderCourt && value === placeholderCourt.id;

  // ── Single-mode helpers ──

  const getDisplayName = useCallback(() => {
    if (value === null) return null;

    // Check placeholder court
    if (placeholderCourt && value === placeholderCourt.id) return null; // handled by isPlaceholder render

    const homeCourt = homeCourts.find((c) => c.id === value);
    if (homeCourt) return homeCourt.name;

    if (browsedCourt && browsedCourt.id === value) return browsedCourt.name;

    if (valueName) return valueName;

    return `Court #${value}`;
  }, [value, valueName, homeCourts, browsedCourt, placeholderCourt]);

  const handleSelect = (courtId: number | string) => {
    onChange?.(courtId as number);
    setIsOpen(false);
  };

  const handleOther = () => {
    if (mode === 'single' && placeholderCourt) {
      onChange?.(placeholderCourt.id as number);
    }
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(null);
    setBrowsedCourt(null);
  };

  // ── Multi-mode helpers ──

  const selectedIds = new Set(selectedCourts.map((c) => c.id));

  const handleMultiAdd = (court: CourtOption) => {
    if (!selectedIds.has(court.id)) {
      onSet?.([...selectedCourts, court]);
    }
    setIsOpen(false);
  };

  const handleMultiAddOther = () => {
    if (placeholderCourt && !selectedIds.has(placeholderCourt.id as number)) {
      onSet?.([...selectedCourts, { id: placeholderCourt.id as number, name: placeholderCourt.name }]);
    }
    setIsOpen(false);
  };

  // ── Browser modal confirm ──

  const handleBrowserConfirm = (selected: CourtOption[]) => {
    if (mode === 'single') {
      if (selected.length > 0) {
        const court = selected[0];
        setBrowsedCourt(court);
        onChange?.(court.id as number);
      }
    } else {
      // Multi: merge browser selection with existing courts
      const newCourts = selected.filter((c) => !selectedIds.has(c.id));
      if (newCourts.length > 0) {
        onSet?.([...selectedCourts, ...newCourts]);
      }
    }
    setShowBrowser(false);
  };

  // ── Render: Multi mode ──

  if (mode === 'multi') {
    return (
      <div className="court-selector court-selector--multi" ref={wrapperRef}>
        {label && (
          <label className="form-label">
            {label}
            {required && <span className="required"> *</span>}
          </label>
        )}

        {/* Selected court pills */}
        {selectedCourts.length > 0 && (
          <div className="court-selector__pills">
            {selectedCourts.map((court, i) => (
              <span
                key={court.id}
                className={`court-selector__pill${i === 0 && selectedCourts.length > 1 ? ' court-selector__pill--primary' : ''}`}
              >
                {onSetPrimary && selectedCourts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onSetPrimary(court.id as number)}
                    className={`court-selector__pill-star${i === 0 ? ' court-selector__pill-star--active' : ''}`}
                    aria-label={i === 0 ? 'Primary court' : `Set ${court.name} as primary`}
                    title={i === 0 ? 'Primary court' : 'Set as primary'}
                    disabled={i === 0}
                  >
                    <Star size={12} />
                  </button>
                )}
                <span className="court-selector__pill-name">{court.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove?.(court.id as number)}
                  className="court-selector__pill-remove"
                  aria-label={`Remove ${court.name}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add court trigger */}
        <button
          ref={triggerRef}
          type="button"
          className={`court-selector__add-trigger${isOpen ? ' court-selector__add-trigger--open' : ''}`}
          onClick={() => { if (!isOpen) checkDropdownDirection(); setIsOpen(!isOpen); }}
        >
          <Plus size={14} />
          <span>{selectedCourts.length > 0 ? 'Add court...' : 'Add a court...'}</span>
          <ChevronDown size={14} className={`court-selector__chevron${isOpen ? ' court-selector__chevron--open' : ''}`} />
        </button>

        {/* Multi dropdown */}
        {isOpen && (
          <div className={`court-selector__dropdown${openUpward ? ' court-selector__dropdown--upward' : ''}`}>
            {homeCourts.length > 0 && (
              <>
                <div className="court-selector__section-label">Home Courts</div>
                {homeCourts
                  .filter((c) => !selectedIds.has(c.id))
                  .map((court) => (
                    <button
                      key={court.id}
                      type="button"
                      className="court-selector__option"
                      onClick={() => handleMultiAdd(court)}
                    >
                      <span className="court-selector__star">&#9733;</span>
                      <div className="court-selector__option-info">
                        <div className="court-selector__option-name">{court.name}</div>
                        {court.address && (
                          <div className="court-selector__option-address">{court.address}</div>
                        )}
                      </div>
                    </button>
                  ))}
                {homeCourts.every((c) => selectedIds.has(c.id)) && (
                  <div className="court-selector__empty-hint">All home courts added</div>
                )}
                <div className="court-selector__divider" />
              </>
            )}

            <button
              type="button"
              className="court-selector__option court-selector__option--browse"
              onClick={() => { setIsOpen(false); setShowBrowser(true); }}
            >
              <Search size={16} />
              <span>Browse all courts</span>
              <span className="court-selector__arrow">&rarr;</span>
            </button>

            {placeholderCourt && !selectedIds.has(placeholderCourt.id as number) && (
              <>
                <div className="court-selector__divider" />
                <button
                  type="button"
                  className="court-selector__option court-selector__option--other"
                  onClick={handleMultiAddOther}
                >
                  <Ban size={16} />
                  <span>{placeholderCourt.name}</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Browser Modal */}
        <CourtBrowserModal
          isOpen={showBrowser}
          onClose={() => setShowBrowser(false)}
          onConfirm={handleBrowserConfirm}
          mode="multi"
          initialSelectedCourts={selectedCourts}
          preFilterLocationId={preFilterLocationId}
          title="Add Courts"
        />
      </div>
    );
  }

  // ── Render: Single mode (original) ──

  const displayName = getDisplayName();
  const showClearButton = value !== null || browsedCourt;

  return (
    <div className="court-selector" ref={wrapperRef}>
      {label && (
        <label className="form-label">
          {label}
          {required && <span className="required"> *</span>}
        </label>
      )}

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        className={`court-selector__trigger${isOpen ? ' court-selector__trigger--open' : ''}${disabled ? ' court-selector__trigger--disabled' : ''}`}
        onClick={() => { if (disabled) return; if (!isOpen) checkDropdownDirection(); setIsOpen(!isOpen); }}
        disabled={disabled}
      >
        <span className={`court-selector__value${!displayName && !isPlaceholder ? ' court-selector__value--placeholder' : ''}`}>
          {isPlaceholder ? (
            <span className="court-selector__other-label">{placeholderCourt.name}</span>
          ) : displayName ? (
            <>
              {homeCourts.some((c) => c.id === value) && (
                <span className="court-selector__star">&#9733;</span>
              )}
              {displayName}
            </>
          ) : (
            'Select court...'
          )}
        </span>
        <span className="court-selector__icons">
          {showClearButton && (
            <span
              className="court-selector__clear"
              onClick={handleClear}
              role="button"
              tabIndex={-1}
              aria-label="Clear court selection"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={16} className={`court-selector__chevron${isOpen ? ' court-selector__chevron--open' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={`court-selector__dropdown${openUpward ? ' court-selector__dropdown--upward' : ''}`}>
          {homeCourts.length > 0 && (
            <>
              <div className="court-selector__section-label">Home Courts</div>
              {homeCourts.map((court, i) => (
                <button
                  key={court.id}
                  type="button"
                  className={`court-selector__option${value === court.id ? ' court-selector__option--selected' : ''}`}
                  onClick={() => handleSelect(court.id)}
                >
                  <span className="court-selector__star">&#9733;</span>
                  <div className="court-selector__option-info">
                    <div className="court-selector__option-name">
                      {court.name}
                      {i === 0 && <span className="court-selector__primary-hint">(primary)</span>}
                    </div>
                    {court.address && (
                      <div className="court-selector__option-address">{court.address}</div>
                    )}
                  </div>
                </button>
              ))}
              <div className="court-selector__divider" />
            </>
          )}

          <button
            type="button"
            className="court-selector__option court-selector__option--browse"
            onClick={() => { setIsOpen(false); setShowBrowser(true); }}
          >
            <Search size={16} />
            <span>Browse all courts</span>
            <span className="court-selector__arrow">&rarr;</span>
          </button>

          {placeholderCourt && (
            <>
              <div className="court-selector__divider" />

              <button
                type="button"
                className={`court-selector__option court-selector__option--other${isPlaceholder ? ' court-selector__option--selected' : ''}`}
                onClick={handleOther}
              >
                <Ban size={16} />
                <span>{placeholderCourt.name}</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Browser Modal */}
      <CourtBrowserModal
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        onConfirm={handleBrowserConfirm}
        mode="single"
        initialSelectedCourts={(() => {
          if (!value || isPlaceholder) return [];
          const court = browsedCourt?.id === value ? browsedCourt : homeCourts.find((c) => c.id === value);
          return court ? [court] : [{ id: value }];
        })()}
        preFilterLocationId={preFilterLocationId}
        title="Select Court"
      />
    </div>
  );
}
