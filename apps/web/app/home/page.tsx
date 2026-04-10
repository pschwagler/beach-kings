import { Suspense } from 'react';
import HomePage from '../../src/components/HomePage';
import PageSkeleton from '../../src/components/ui/PageSkeleton';

const VALID_HOME_TABS = ['home', 'profile', 'leagues', 'my-games', 'my-stats', 'friends', 'messages', 'invites', 'notifications'];

export default async function HomePageRoute({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const tab = params?.tab;
  const initialTab = VALID_HOME_TABS.includes(tab) ? tab : 'home';

  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomePage initialTab={initialTab} />
    </Suspense>
  );
}
