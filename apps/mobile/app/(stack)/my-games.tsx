/**
 * My Games route — thin entry point.
 * Delegates entirely to MyGamesScreen which owns all state and layout.
 */

import React from 'react';
import { MyGamesScreen } from '@/components/screens/Games';

export default function MyGamesRoute(): React.ReactNode {
  return <MyGamesScreen />;
}
