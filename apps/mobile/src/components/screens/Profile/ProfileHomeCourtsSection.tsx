import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import AppText from '@/components/ui/AppText';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import SectionError from '@/components/home/SectionError';
import { useAuth } from '@/contexts/AuthContext';
import { playerQueries } from '@/features/player';

interface Props {
  readonly playerId: number;
  readonly onEdit: () => void;
}

export default function ProfileHomeCourtsSection({
  playerId,
  onEdit,
}: Props): React.ReactNode {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const query = useQuery(playerQueries.homeCourts(userId, playerId));
  const courts = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.position - b.position),
    [query.data],
  );

  return (
    <View className="px-lg pt-lg" testID="profile-home-courts-section">
      <View className="flex-row items-center justify-between mb-sm">
        <AppText className="text-body font-bold text-default">Home Courts</AppText>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Edit home courts"
          className="min-h-touch px-sm items-center justify-center active:opacity-70"
        >
          <AppText className="text-sm font-semibold text-brand-teal">Edit</AppText>
        </Pressable>
      </View>

      <View className="rounded-card bg-surface px-lg py-md">
        {query.isPending ? (
          <View accessibilityLabel="Loading home courts" className="gap-sm">
            <LoadingSkeleton width="75%" height={18} borderRadius={4} />
            <LoadingSkeleton width="55%" height={18} borderRadius={4} />
          </View>
        ) : query.isError ? (
          <SectionError
            message="Home courts could not be loaded."
            onRetry={() => { void query.refetch(); }}
          />
        ) : courts.length === 0 ? (
          <AppText className="text-sm text-muted">No home courts saved.</AppText>
        ) : (
          courts.map((court, index) => (
            <View
              key={court.id}
              className={`py-xs ${index > 0 ? 'border-t border-divider' : ''}`}
            >
              <AppText className="text-body text-default">
                {index + 1}. {court.name?.trim() || 'Unnamed court'}
              </AppText>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
