'use client';

import { Search } from 'lucide-react';

/**
 * Lists unrecognized player names extracted from the scoresheet.
 * Each name is clickable to open the player search modal for resolution.
 *
 * @param {Object} props
 * @param {string[]} props.unmatchedNames - Unique raw names that couldn't be matched
 * @param {function} props.onResolve - Called with the raw name when user clicks to resolve
 */
interface UnrecognizedPlayersSectionProps {
  unmatchedNames: string[];
  onResolve: (name: string) => void;
}

export default function UnrecognizedPlayersSection({ unmatchedNames, onResolve }: UnrecognizedPlayersSectionProps) {
  if (!unmatchedNames?.length) return null;

  return (
    <div className="unrecognized-players">
      <div className="unrecognized-players__header">
        <h4 className="unrecognized-players__title">
          Unrecognized Players ({unmatchedNames.length})
        </h4>
        <span className="unrecognized-players__hint">
          Click a name to find or create the player
        </span>
      </div>
      <div className="unrecognized-players__list">
        {unmatchedNames.map((name) => (
          <button
            key={name}
            type="button"
            className="unrecognized-players__chip"
            onClick={() => onResolve(name)}
          >
            <Search size={14} className="unrecognized-players__chip-icon" />
            <span className="unrecognized-players__chip-name">{name}</span>
          </button>
        ))}
      </div>

      {/* @ts-ignore */}
      <style jsx>{`
        .unrecognized-players {
          margin-top: 16px;
          padding: 12px;
          background: var(--warning-bg);
          border: 1px solid var(--warning-border);
          border-radius: 8px;
        }

        .unrecognized-players__header {
          margin-bottom: 8px;
        }

        .unrecognized-players__title {
          font-size: 13px;
          font-weight: 600;
          color: var(--warning-text);
          margin: 0;
        }

        .unrecognized-players__hint {
          font-size: 12px;
          color: var(--gray-600);
        }

        .unrecognized-players__list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .unrecognized-players__chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: white;
          border: 1px solid var(--warning-border);
          border-radius: 20px;
          cursor: pointer;
          font-size: 13px;
          font-family: inherit;
          color: var(--gray-900);
          transition: background 0.15s, border-color 0.15s;
          min-height: 36px;
        }

        .unrecognized-players__chip:hover {
          background: var(--gray-50);
          border-color: var(--primary);
        }

        .unrecognized-players__chip:active {
          background: var(--gray-100);
        }

        .unrecognized-players__chip-icon {
          color: var(--warning-text);
          flex-shrink: 0;
        }

        .unrecognized-players__chip-name {
          font-style: italic;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
