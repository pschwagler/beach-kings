import React, { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface PrivateQueryCacheGuardProps {
  readonly children: React.ReactNode;
}

/**
 * Clears the long-lived QueryClient when an authenticated account leaves or
 * changes. Query keys are still user scoped; this additionally ensures private
 * payloads are not retained in memory after logout.
 */
export default function PrivateQueryCacheGuard({
  children,
}: PrivateQueryCacheGuardProps): React.ReactNode {
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const previousUserId = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (isLoading) return;
    const currentUserId = isAuthenticated ? (user?.id ?? null) : null;
    const previous = previousUserId.current;
    if (previous !== undefined && previous !== null && previous !== currentUserId) {
      queryClient.clear();
    }
    previousUserId.current = currentUserId;
  }, [isAuthenticated, isLoading, queryClient, user?.id]);

  return children;
}
