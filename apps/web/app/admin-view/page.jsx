'use client';

import { Suspense } from 'react';
import AdminView from '../../src/components/admin/AdminView';

export default function AdminViewPage() {
  return (
    <Suspense>
      <AdminView />
    </Suspense>
  );
}
