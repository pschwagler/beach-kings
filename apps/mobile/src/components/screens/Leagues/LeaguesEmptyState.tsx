/**
 * Empty state shown when the user belongs to no leagues.
 * Mirrors the `.empty-state-wrap` block in leagues-tab.html wireframe.
 */

import React from 'react';
import { TrophyIcon } from '@/components/ui/icons';
import EmptyState from '@/components/ui/EmptyState';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface LeaguesEmptyStateProps {
  readonly onFindLeagues: () => void;
  readonly onCreateLeague: () => void;
}

export default function LeaguesEmptyState({
  onFindLeagues,
  onCreateLeague,
}: LeaguesEmptyStateProps): React.ReactNode {
  const palette = usePaletteColors();
  return <EmptyState
    testID="leagues-empty-state"
    icon={<TrophyIcon size={32} color={palette.brandTeal} />}
    title="No Leagues Yet"
    description="Join a league to start playing and tracking your stats"
    primaryAction={{ label: 'Find a League', onPress: onFindLeagues, testID: 'find-leagues-cta' }}
    secondaryAction={{ label: 'Create a League', onPress: onCreateLeague }}
  />;
}
