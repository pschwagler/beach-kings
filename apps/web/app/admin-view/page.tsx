'use client';

import { Suspense } from 'react';
import AdminView from '../../src/components/admin/AdminView';
import PageSkeleton from '../../src/components/ui/PageSkeleton';

export default function AdminViewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminView />
    </Suspense>
  );
}
