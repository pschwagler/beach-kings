import { Suspense } from 'react';
import HomePage from '../../src/components/HomePage';

const VALID_HOME_TABS = ['home', 'profile', 'leagues', 'my-games', 'friends', 'invites', 'notifications'];

export default async function HomePageRoute({ searchParams }) {
  const params = await searchParams;
  const tab = params?.tab;
  const initialTab = VALID_HOME_TABS.includes(tab) ? tab : 'home';

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomePage initialTab={initialTab} />
    </Suspense>
  );
}
