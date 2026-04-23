/**
 * Find Players route — thin entry point.
 * Delegates entirely to FindPlayersScreen which owns all state and layout.
 */

import React from 'react';
import { FindPlayersScreen } from '@/components/screens/FindPlayers';

export default function FindPlayersRoute(): React.ReactNode {
  return <FindPlayersScreen />;
}
