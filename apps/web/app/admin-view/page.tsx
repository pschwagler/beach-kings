'use client';

import { Suspense } from 'react';
import AdminView from '../../src/components/admin/AdminView';
import RouteLoadingShell from '../../src/components/ui/RouteLoadingShell';

export default function AdminViewPage() {
  return (
    <Suspense fallback={<RouteLoadingShell />}>
      <AdminView />
    </Suspense>
  );
}
