import {
  GENDER_OPTIONS,
  SKILL_LEVEL_DESCRIPTIONS,
  SKILL_LEVEL_OPTIONS,
} from '@beach-kings/shared';
import type { SelectOption } from '@/components/forms';
import type { LocationWithDistance } from '@/lib/useLocationAutoSelect';
import { fullStateName } from '@/lib/usStates';

export const GENDER_SELECT_OPTIONS: readonly SelectOption[] =
  GENDER_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));

export const SKILL_LEVEL_SELECT_OPTIONS: readonly SelectOption[] =
  SKILL_LEVEL_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    sublabel: SKILL_LEVEL_DESCRIPTIONS[option.value],
  }));

export const PREFERRED_SIDE_SELECT_OPTIONS: readonly SelectOption[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'none', label: 'No preference' },
];

export function formatLocationLabel(location: LocationWithDistance): string {
  const base =
    location.name ?? `${location.city ?? ''}, ${location.state ?? ''}`;
  if (typeof location.distance_miles === 'number') {
    return `${base} (${Math.round(location.distance_miles)} mi)`;
  }
  return base;
}

export function buildLocationSearchText(
  location: LocationWithDistance,
): string {
  return [
    location.city,
    location.state,
    fullStateName(location.state),
    location.name,
    location.region_name,
  ]
    .filter((value): value is string =>
      typeof value === 'string' && value.length > 0)
    .join(' ');
}

export function isoBirthdayToDisplay(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (match == null) return '';
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}
