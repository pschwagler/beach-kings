/**
 * Messages inbox route — thin entry point.
 * Delegates entirely to MessagesScreen which owns all state and layout.
 */

import React from 'react';
import { MessagesScreen } from '@/components/screens/Messages';

export default function MessagesListRoute(): React.ReactNode {
  return <MessagesScreen />;
}
