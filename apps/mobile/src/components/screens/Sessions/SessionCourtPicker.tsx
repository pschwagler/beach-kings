import React, { useEffect, useMemo, useRef, useState } from 'react';
import AppText from '@/components/ui/AppText';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { Court } from '@beach-kings/shared';

import CourtPickerModal, { type CourtPickerOption } from '@/components/ui/CourtPickerModal';
import { courtQueries } from '@/features/courts';
import { formatDistance } from '@/lib/formatters';
import { useResolvedUserLocation } from '@/hooks/useResolvedUserLocation';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  readonly selectedCourtId: number | null;
  readonly selectedCourtName?: string | null;
  readonly onChange: (courtId: number | null, courtName?: string | null) => void;
  readonly testIDPrefix: string;
  readonly allowNone?: boolean;
  readonly selectDefaultCourt?: boolean;
  readonly isUpdating?: boolean;
  readonly error?: string | null;
}

function courtId(court: Court): number | null {
  if (typeof court.id === 'number') return court.id;
  const parsed = Number(court.id);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reusable picker for assigning a session to one of the existing courts. */
export default function SessionCourtPicker({
  selectedCourtId,
  selectedCourtName,
  onChange,
  testIDPrefix,
  allowNone = true,
  selectDefaultCourt = false,
  isUpdating = false,
  error = null,
}: Props): React.ReactNode {
  const palette = usePaletteColors();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const didSelectDefault = useRef(false);
  const { coords, isResolving } = useResolvedUserLocation({ skipDevice: true });
  const { data: courts, isLoading } = useQuery(
    courtQueries.catalog(user?.id ?? 0, coords, !isResolving && user != null),
  );

  const courtOptions = useMemo<readonly CourtPickerOption[]>(
    () => (courts ?? []).flatMap((court) => {
      const id = courtId(court);
      return id == null
        ? []
        : [{
            id,
            name: court.name,
            detail:
              court.distance_miles == null
                ? null
                : formatDistance(court.distance_miles),
          }];
    }),
    [courts],
  );

  useEffect(() => {
    if (
      !selectDefaultCourt ||
      didSelectDefault.current ||
      isLoading ||
      selectedCourtId != null ||
      courtOptions.length === 0
    ) {
      return;
    }
    didSelectDefault.current = true;
    const nearest = courtOptions[0];
    onChange(nearest.id, nearest.name);
  }, [
    courtOptions,
    isLoading,
    onChange,
    selectDefaultCourt,
    selectedCourtId,
  ]);

  const selectedName = useMemo(() => {
    if (selectedCourtId == null) return 'Select a court';
    const selected = courts?.find((court) => courtId(court) === selectedCourtId);
    return selected?.name ?? selectedCourtName ?? 'Select a court';
  }, [courts, selectedCourtId, selectedCourtName]);

  return (
    <>
      <Pressable
        testID={`${testIDPrefix}-court-picker`}
        onPress={() => setIsOpen(true)}
        disabled={isUpdating}
        accessibilityRole="button"
        accessibilityLabel="Select court"
        className="flex-row items-center py-[14px] border-b border-divider active:opacity-70"
      >
        <AppText className="text-[14px] font-semibold text-muted w-[100px]">
          Court
        </AppText>
        <AppText
          testID={`${testIDPrefix}-selected-court`}
          className={`flex-1 text-[14px] ${
            selectedCourtId == null ? 'text-muted' : 'text-default'
          }`}
          numberOfLines={1}
        >
          {selectedName}
        </AppText>
        {isUpdating ? (
          <ActivityIndicator
            testID={`${testIDPrefix}-court-saving`}
            color={palette.brandTeal}
          />
        ) : (
          <AppText className="text-[14px] font-semibold text-brand-teal">Change</AppText>
        )}
      </Pressable>
      {error != null && (
        <View className="pt-2">
          <AppText
            testID={`${testIDPrefix}-court-error`}
            accessibilityRole="alert"
            className="text-[12px] text-danger"
          >
            {error}
          </AppText>
        </View>
      )}

      <CourtPickerModal
        visible={isOpen}
        courts={courtOptions}
        selectedCourtId={selectedCourtId}
        onSelect={(id) => {
          const selected = courtOptions.find((court) => court.id === id);
          onChange(id, selected?.name ?? null);
        }}
        onClose={() => setIsOpen(false)}
        allowNone={allowNone}
        isLoading={isLoading}
        testIDPrefix={`${testIDPrefix}-court`}
        closeTestID={`${testIDPrefix}-court-picker-close`}
      />
    </>
  );
}
