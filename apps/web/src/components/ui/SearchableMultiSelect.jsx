'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, ChevronDown, Search } from 'lucide-react';

/**
 * Tom Select-style searchable multi-select dropdown.
 * Shows selected items as pills, supports type-to-filter, and checkbox-toggle options.
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string}>} props.options - Available options
 * @param {string[]} props.selectedIds - Currently selected option IDs
 * @param {(id: string) => void} props.onToggle - Called when an option is toggled
 * @param {string} [props.placeholder] - Placeholder when no selection
 * @param {string} [props.label] - Section label above the select
 */
export default function SearchableMultiSelect({
  options = [],
  selectedIds = [],
  onToggle,
  placeholder = 'Search...',
  label,
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedOptions = options.filter((o) => selectedIds.includes(o.id));

  const handleToggle = useCallback(
    (id) => {
      onToggle(id);
    },
    [onToggle]
  );

  const handleRemovePill = useCallback(
    (e, id) => {
      e.stopPropagation();
      onToggle(id);
    },
    [onToggle]
  );

  const handleContainerClick = () => {
    setIsOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div className="searchable-multiselect" ref={wrapperRef}>
      {label && <div className="searchable-multiselect__label">{label}</div>}
      <div
        className={`searchable-multiselect__control ${isOpen ? 'searchable-multiselect__control--open' : ''}`}
        onClick={handleContainerClick}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="searchable-multiselect__value-wrap">
          {selectedOptions.map((opt) => (
            <span key={opt.id} className="searchable-multiselect__pill">
              <span className="searchable-multiselect__pill-label">{opt.label}</span>
              <button
                type="button"
                className="searchable-multiselect__pill-remove"
                onClick={(e) => handleRemovePill(e, opt.id)}
                aria-label={`Remove ${opt.label}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            className="searchable-multiselect__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            placeholder={selectedIds.length === 0 ? placeholder : ''}
            aria-label={label || placeholder}
          />
        </div>
        <span className="searchable-multiselect__indicator" aria-hidden="true">
          {selectedIds.length === 0 ? (
            <Search size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </span>
      </div>
      {isOpen && (
        <ul className="searchable-multiselect__menu" role="listbox" aria-multiselectable="true">
          {filtered.length === 0 ? (
            <li className="searchable-multiselect__no-results">No matches</li>
          ) : (
            filtered.map((opt) => {
              const selected = selectedIds.includes(opt.id);
              return (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={selected}
                  className={`searchable-multiselect__option ${selected ? 'searchable-multiselect__option--selected' : ''}`}
                  onClick={() => handleToggle(opt.id)}
                >
                  <span className="searchable-multiselect__option-check" aria-hidden="true">
                    {selected && <Check size={14} strokeWidth={2.5} />}
                  </span>
                  <span>{opt.label}</span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
