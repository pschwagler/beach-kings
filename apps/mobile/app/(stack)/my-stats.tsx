/**
 * My Stats route — thin entry point.
 * Delegates entirely to MyStatsScreen which owns all state and layout.
 */

import React from 'react';
import { MyStatsScreen } from '@/components/screens/Games';

export default function MyStatsRoute(): React.ReactNode {
  return <MyStatsScreen />;
}
