'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, MapPin, Search, X } from 'lucide-react';
import { getPlaceSuggestions, getPublicCourts, type PlaceSuggestion } from '../../services/api';
import type { Court } from '../../types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onCourtSelect: (court: Court) => void;
  onPlaceSelect: (place: PlaceSuggestion) => void;
  proximity?: { latitude: number; longitude: number };
}

type Option = { kind: 'court'; item: Court } | { kind: 'place'; item: PlaceSuggestion };

export default function CourtSearchCombobox(props: Props) {
  const { value, onChange, onClear, onCourtSelect, onPlaceSelect, proximity } = props;
  const [courts, setCourts] = useState<Court[]>([]);
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const requestRef = useRef(0);
  const options: Option[] = [
    ...courts.map((item): Option => ({ kind: 'court', item })),
    ...places.map((item): Option => ({ kind: 'place', item })),
  ];

  useEffect(() => {
    if (value.trim().length < 2) {
      setCourts([]); setPlaces([]); setOpen(false); setLoading(false);
      return;
    }
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const [courtData, placeData] = await Promise.all([
          getPublicCourts({ search: value.trim(), page: 1, page_size: 5 }, controller.signal),
          getPlaceSuggestions(value.trim(), proximity, controller.signal).catch(() => []),
        ]);
        if (requestRef.current !== requestId) return;
        setCourts(courtData.items || []);
        setPlaces(placeData || []);
        setOpen(true);
        setActive(-1);
      } catch (error) {
        if (!controller.signal.aborted) { setCourts([]); setPlaces([]); setOpen(true); }
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value, proximity?.latitude, proximity?.longitude]);

  const choose = (option: Option) => {
    setOpen(false);
    if (option.kind === 'court') onCourtSelect(option.item);
    else onPlaceSelect(option.item);
  };

  return (
    <div className="court-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <Search className="court-search__icon" size={18} aria-hidden="true" />
      <input
        role="combobox"
        aria-label="Search courts and places"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        placeholder="Search courts, cities, ZIP codes, or amenities"
        onFocus={() => options.length && setOpen(true)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(options[active]); }
          if (event.key === 'Escape') { setOpen(false); setActive(-1); }
        }}
      />
      {loading && <LoaderCircle className="court-search__spinner" size={17} aria-label="Searching" />}
      {value && !loading && (
        <button type="button" className="court-search__clear" onClick={onClear} aria-label="Clear search"><X size={17} /></button>
      )}
      {open && (
        <div id={listId} role="listbox" className="court-search__menu">
          {courts.length > 0 && <div className="court-search__group">Courts</div>}
          {courts.map((court, index) => (
            <button id={`${listId}-${index}`} role="option" aria-selected={active === index} key={court.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose({ kind: 'court', item: court })}>
              <MapPin size={16} /><span><strong>{court.name}</strong><small>{court.address || [court.city, court.state].filter(Boolean).join(', ')}</small></span>
            </button>
          ))}
          {places.length > 0 && <div className="court-search__group">Places</div>}
          {places.map((place, placeIndex) => {
            const index = courts.length + placeIndex;
            return <button id={`${listId}-${index}`} role="option" aria-selected={active === index} key={place.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose({ kind: 'place', item: place })}>
              <Search size={16} /><span><strong>{place.primary_text}</strong><small>{place.secondary_text}</small></span>
            </button>;
          })}
          {!loading && options.length === 0 && <p className="court-search__empty">No matching courts or places. Try a city or ZIP code.</p>}
        </div>
      )}
    </div>
  );
}
