import React, { useMemo, useState } from 'react';
import { Pressable, Text } from 'react-native';
import type { Court } from '@beach-kings/shared';

import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import CourtPickerModal, { type CourtPickerOption } from '@/components/ui/CourtPickerModal';

interface Props {
  readonly selectedCourtId: number | null;
  readonly selectedCourtName?: string | null;
  readonly onChange: (courtId: number | null) => void;
  readonly testIDPrefix: string;
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
}: Props): React.ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const { data: courts, isLoading } = useApi<Court[]>(() => api.getCourts(), []);

  const courtOptions = useMemo<readonly CourtPickerOption[]>(
    () => (courts ?? []).flatMap((court) => {
      const id = courtId(court);
      return id == null ? [] : [{ id, name: court.name }];
    }),
    [courts],
  );

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
        accessibilityRole="button"
        accessibilityLabel="Select court"
        className="flex-row items-center py-[14px] border-b border-divider active:opacity-70"
      >
        <Text className="text-[14px] font-semibold text-muted w-[100px]">
          Court
        </Text>
        <Text
          testID={`${testIDPrefix}-selected-court`}
          className={`flex-1 text-[14px] ${
            selectedCourtId == null ? 'text-muted' : 'text-default'
          }`}
          numberOfLines={1}
        >
          {selectedName}
        </Text>
        <Text className="text-[14px] font-semibold text-brand-teal">Change</Text>
      </Pressable>

      <CourtPickerModal
        visible={isOpen}
        courts={courtOptions}
        selectedCourtId={selectedCourtId}
        onSelect={onChange}
        onClose={() => setIsOpen(false)}
        allowNone
        isLoading={isLoading}
        testIDPrefix={`${testIDPrefix}-court`}
        closeTestID={`${testIDPrefix}-court-picker-close`}
      />
    </>
  );
}
