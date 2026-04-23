/**
 * Social tab — messaging-forward hub.
 * Delegates all rendering to `SocialScreen` to keep this entry thin.
 */

import React from 'react';
import SocialScreen from '@/components/screens/Social/SocialScreen';

export default function SocialTab(): React.ReactNode {
  return <SocialScreen />;
}
