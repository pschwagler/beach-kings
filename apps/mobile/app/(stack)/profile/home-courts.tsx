import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import AppText from '@/components/ui/AppText';
import CourtPickerModal from '@/components/ui/CourtPickerModal';
import SectionError from '@/components/home/SectionError';
import TopNav from '@/components/ui/TopNav';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { courtQueries } from '@/features/courts';
import { playerQueries, useHomeCourtMutations } from '@/features/player';
import { useCurrentPlayer } from '@/hooks/useCurrentPlayer';
import { getApiErrorMessage } from '@/lib/apiError';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { hapticSuccess } from '@/utils/haptics';

export default function HomeCourtsScreen(): React.ReactNode {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const palette = usePaletteColors();
  const playerQuery = useCurrentPlayer();
  const playerId = playerQuery.data?.id ?? 0;
  const userId = user?.id ?? 0;
  const homeCourtsQuery = useQuery(
    playerQueries.homeCourts(userId, playerId, playerId > 0),
  );
  const catalogQuery = useQuery(courtQueries.catalog(userId, null));
  const { setHomeCourts } = useHomeCourtMutations(playerId);
  const [courtIds, setCourtIds] = useState<readonly number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const initializedForRef = useRef<string | null>(null);

  useEffect(() => {
    const ownerKey = `${userId}:${playerId}`;
    if (initializedForRef.current !== ownerKey) {
      initializedForRef.current = null;
      setCourtIds([]);
    }
    if (homeCourtsQuery.data == null || initializedForRef.current === ownerKey) {
      return;
    }
    initializedForRef.current = ownerKey;
    setCourtIds(
      [...homeCourtsQuery.data]
        .sort((a, b) => a.position - b.position)
        .map((court) => court.id),
    );
  }, [homeCourtsQuery.data, playerId, userId]);

  const courtNames = useMemo(() => {
    const names = new Map<number, string>();
    for (const court of homeCourtsQuery.data ?? []) {
      names.set(court.id, court.name?.trim() || 'Unnamed court');
    }
    for (const court of catalogQuery.data ?? []) {
      const id = Number(court.id);
      if (Number.isInteger(id) && id > 0) names.set(id, court.name);
    }
    return names;
  }, [catalogQuery.data, homeCourtsQuery.data]);

  const availableCourts = useMemo(
    () => (catalogQuery.data ?? []).flatMap((court) => {
      const id = Number(court.id);
      return Number.isInteger(id) && id > 0 && !courtIds.includes(id)
        ? [{ id, name: court.name }]
        : [];
    }),
    [catalogQuery.data, courtIds],
  );

  const moveCourt = (index: number, offset: -1 | 1): void => {
    setCourtIds((current) => {
      const destination = index + offset;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };

  const save = async (): Promise<void> => {
    try {
      await setHomeCourts.mutateAsync(courtIds);
      void hapticSuccess();
      showToast('Home courts updated.', 'success');
      router.back();
    } catch (error) {
      showToast(
        getApiErrorMessage(error, 'Home courts could not be saved. Please try again.'),
        'error',
      );
    }
  };

  const saveAction = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Save home courts"
      accessibilityState={{ disabled: setHomeCourts.isPending }}
      disabled={setHomeCourts.isPending || playerId <= 0}
      onPress={() => { void save(); }}
      className="min-h-touch min-w-11 items-end justify-center active:opacity-70 disabled:opacity-50"
    >
      <AppText className="text-sm font-semibold text-inverse">
        {setHomeCourts.isPending ? 'Saving…' : 'Save'}
      </AppText>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav title="Home Courts" showBack rightAction={saveAction} />
      {playerQuery.isPending || homeCourtsQuery.isPending ? (
        <View className="flex-1 items-center justify-center" accessibilityLabel="Loading home courts">
          <ActivityIndicator color={palette.brandTeal} />
        </View>
      ) : playerQuery.isError || playerId <= 0 || homeCourtsQuery.isError ? (
        <View className="px-lg pt-lg">
          <SectionError
            message="Home courts could not be loaded."
            onRetry={() => {
              void Promise.allSettled([playerQuery.refetch(), homeCourtsQuery.refetch()]);
            }}
          />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="px-lg py-lg gap-md">
          <AppText className="text-sm text-muted">
            Your first court is used as the default when you create a session.
          </AppText>

          {courtIds.length === 0 ? (
            <View className="rounded-card bg-surface px-lg py-xl items-center">
              <AppText className="text-body text-muted text-center">
                No home courts saved yet.
              </AppText>
            </View>
          ) : (
            <View className="rounded-card bg-surface px-lg">
              {courtIds.map((courtId, index) => (
                <View
                  key={courtId}
                  testID={`home-court-row-${courtId}`}
                  className={`flex-row items-center py-sm ${index > 0 ? 'border-t border-divider' : ''}`}
                >
                  <AppText className="w-7 text-body font-semibold text-muted">
                    {index + 1}.
                  </AppText>
                  <AppText className="flex-1 text-body text-default" numberOfLines={2}>
                    {courtNames.get(courtId) ?? 'Unnamed court'}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${courtNames.get(courtId) ?? 'court'} up`}
                    accessibilityState={{ disabled: index === 0 }}
                    disabled={index === 0}
                    onPress={() => moveCourt(index, -1)}
                    className="w-11 h-11 items-center justify-center active:opacity-70 disabled:opacity-30"
                  >
                    <AppText className="text-xl text-brand-teal">↑</AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${courtNames.get(courtId) ?? 'court'} down`}
                    accessibilityState={{ disabled: index === courtIds.length - 1 }}
                    disabled={index === courtIds.length - 1}
                    onPress={() => moveCourt(index, 1)}
                    className="w-11 h-11 items-center justify-center active:opacity-70 disabled:opacity-30"
                  >
                    <AppText className="text-xl text-brand-teal">↓</AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${courtNames.get(courtId) ?? 'court'}`}
                    onPress={() => setCourtIds((current) => current.filter((id) => id !== courtId))}
                    className="min-h-touch px-sm items-center justify-center active:opacity-70"
                  >
                    <AppText className="text-sm font-semibold text-danger">Remove</AppText>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add home court"
            onPress={() => setPickerOpen(true)}
            className="min-h-touch rounded-button bg-brand-teal items-center justify-center px-lg active:opacity-80"
          >
            <AppText className="text-body font-semibold text-on-brand">Add Court</AppText>
          </Pressable>

          {catalogQuery.isError && (
            <SectionError
              message="Available courts could not be loaded."
              onRetry={() => { void catalogQuery.refetch(); }}
            />
          )}
        </ScrollView>
      )}

      <CourtPickerModal
        visible={pickerOpen}
        courts={availableCourts}
        onSelect={(courtId) => {
          if (courtId != null) setCourtIds((current) => [...current, courtId]);
        }}
        onClose={() => setPickerOpen(false)}
        title="Add Home Court"
        isLoading={catalogQuery.isPending}
        emptyLabel="No more courts available"
        testIDPrefix="home-court-picker"
      />
    </SafeAreaView>
  );
}
