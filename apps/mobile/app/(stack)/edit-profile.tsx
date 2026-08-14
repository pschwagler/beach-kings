import React from 'react';
import { Redirect } from 'expo-router';
import { routes } from '@/lib/navigation';

export default function EditProfileRoute(): React.ReactNode {
  return <Redirect href={routes.profile()} />;
}
