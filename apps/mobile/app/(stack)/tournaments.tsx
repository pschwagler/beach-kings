import { useFeatureFlag } from '@/features/feature-flags/queries';
import React from 'react';
import ComingSoon from '@/components/screens/ComingSoon';

export default function TournamentsRoute(): React.ReactNode {
  const flag = useFeatureFlag('kob_tournaments');
  if (flag.isLoading || !flag.enabled) {
    return <ComingSoon title="Tournaments" description={flag.isLoading ? 'Checking availability…' : 'Tournaments are currently unavailable for your account.'} />;
  }
  return (
    <ComingSoon
      title="Tournaments"
      description="Tournament browsing and management are coming soon."
    />
  );
}
