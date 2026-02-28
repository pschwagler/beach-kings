'use client';

import { Suspense } from 'react';
import AdminView from '../../src/components/admin/AdminView';

export default function AdminViewPage() {
  return (
    <Suspense fallback={<div className="container"><p>Loading...</p></div>}>
      <AdminView />
    </Suspense>
  );
}
