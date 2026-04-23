/**
 * Add-phone route — thin entry point for the one-time OTP flow that attaches
 * a phone number to an account that currently has none. Phone *changes* are
 * handled via support mailto from AccountSettingsScreen.
 */

import React from 'react';
import { AddPhoneScreen } from '@/components/screens/Settings';

export default function AddPhoneRoute(): React.ReactNode {
  return <AddPhoneScreen />;
}
