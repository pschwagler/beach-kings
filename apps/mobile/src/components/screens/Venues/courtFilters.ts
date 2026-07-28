import type { CourtFilterChip } from './useCourtsScreen';

interface CourtFilterPresentation {
  readonly id: CourtFilterChip;
  readonly label: string;
  readonly sectionLabel: string;
  readonly emptyTitle: string;
  readonly emptyMessage: string;
}

export const COURT_FILTERS: readonly CourtFilterPresentation[] = [
  {
    id: 'nearby',
    label: 'Nearby',
    sectionLabel: 'Nearby Courts',
    emptyTitle: 'No Nearby Courts',
    emptyMessage: 'No nearby courts were found. Try another filter to broaden your search.',
  },
  {
    id: 'my-courts',
    label: 'My Courts',
    sectionLabel: 'My Courts',
    emptyTitle: 'No Saved Courts',
    emptyMessage: 'Save a court from its details page and it will appear here.',
  },
  {
    id: 'top-rated',
    label: 'Top Rated',
    sectionLabel: 'Top Rated Courts',
    emptyTitle: 'No Top Rated Courts',
    emptyMessage: 'No courts match the top-rated filter. Try another filter.',
  },
  {
    id: 'indoor',
    label: 'Indoor',
    sectionLabel: 'Indoor Courts',
    emptyTitle: 'No Indoor Courts',
    emptyMessage: 'No indoor courts match your search. Try another filter.',
  },
  {
    id: 'outdoor',
    label: 'Outdoor',
    sectionLabel: 'Outdoor Courts',
    emptyTitle: 'No Outdoor Courts',
    emptyMessage: 'No outdoor courts match your search. Try another filter.',
  },
  {
    id: 'lighted',
    label: 'Lighted',
    sectionLabel: 'Lighted Courts',
    emptyTitle: 'No Lighted Courts',
    emptyMessage: 'No courts with lights match your search. Try another filter.',
  },
] as const;

const DEFAULT_PRESENTATION = {
  sectionLabel: 'Nearby Courts',
  emptyTitle: 'No Courts Found',
  emptyMessage: 'No courts match your search.',
} as const;

export function getCourtFilterPresentation(
  filter: CourtFilterChip | null,
): Pick<CourtFilterPresentation, 'sectionLabel' | 'emptyTitle' | 'emptyMessage'> {
  return COURT_FILTERS.find((item) => item.id === filter) ?? DEFAULT_PRESENTATION;
}
