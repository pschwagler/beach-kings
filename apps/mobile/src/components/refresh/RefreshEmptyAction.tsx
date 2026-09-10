import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { RefreshAction } from './RefreshFeedback';
import { useExplicitRefresh } from './useExplicitRefresh';
import type { RefreshProps } from './RefreshScrollView';

/** Non-gesture equivalent for screens whose empty/error state has no list. */
export default function RefreshEmptyAction({ onRefresh, refreshScope = '', refreshLabel = 'content' }: RefreshProps) {
  const { user } = useAuth();
  const state = useExplicitRefresh(onRefresh ?? (() => undefined), `${user?.id ?? 0}:${refreshScope}`, refreshLabel);
  return <RefreshAction state={state} label={refreshLabel} />;
}
