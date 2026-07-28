import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePaletteColors } from '@/theme/usePaletteColors';

export interface CourtPickerOption {
  readonly id: number;
  readonly name: string;
  readonly detail?: string | null;
}

interface Props {
  readonly visible: boolean;
  readonly courts: readonly CourtPickerOption[];
  readonly selectedCourtId?: number | null;
  readonly onSelect: (courtId: number | null) => void | Promise<void>;
  readonly onClose: () => void;
  readonly title?: string;
  readonly allowNone?: boolean;
  readonly noneLabel?: string;
  readonly isLoading?: boolean;
  readonly emptyLabel?: string;
  readonly testIDPrefix?: string;
  readonly modalTestID?: string;
  readonly closeTestID?: string;
}

/** Searchable, controlled court-selection sheet shared by mobile workflows. */
export default function CourtPickerModal({
  visible,
  courts,
  selectedCourtId = null,
  onSelect,
  onClose,
  title = 'Select Court',
  allowNone = false,
  noneLabel = 'No court',
  isLoading = false,
  emptyLabel = 'No courts available',
  testIDPrefix = 'court-picker',
  modalTestID,
  closeTestID,
}: Props): React.ReactNode {
  const palette = usePaletteColors();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const filteredCourts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return courts;
    return courts.filter((court) => court.name.toLowerCase().includes(normalized));
  }, [courts, query]);

  const options: ReadonlyArray<CourtPickerOption | null> = allowNone
    ? [null, ...filteredCourts]
    : filteredCourts;

  return (
    <Modal
      testID={modalTestID ?? `${testIDPrefix}-modal`}
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-page" edges={['top']}>
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-divider">
          <Text className="flex-1 text-[17px] font-semibold text-default">{title}</Text>
          <Pressable
            testID={closeTestID ?? `${testIDPrefix}-close`}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close court picker"
            className="py-1 pl-4 active:opacity-70"
          >
            <Text className="text-[15px] font-semibold text-brand-teal">Done</Text>
          </Pressable>
        </View>

        <View className="px-4 py-3 border-b border-divider">
          <TextInput
            testID={`${testIDPrefix}-search`}
            value={query}
            onChangeText={setQuery}
            placeholder="Search courts"
            placeholderTextColor={palette.textTertiary}
            accessibilityLabel="Search courts"
            className="rounded-[8px] bg-surface px-3 py-[10px] text-[15px] text-default"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={palette.brandTeal} />
          </View>
        ) : (
          <FlatList
            data={options}
            keyExtractor={(court) => String(court?.id ?? 'none')}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={(
              <Text className="px-4 py-8 text-center text-[14px] text-muted">{emptyLabel}</Text>
            )}
            renderItem={({ item, index }) => {
              const id = item?.id ?? null;
              const isSelected = id === selectedCourtId;
              return (
                <Pressable
                  testID={`${testIDPrefix}-option-${id ?? 'none'}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    void onSelect(id);
                    onClose();
                  }}
                  className={`flex-row items-center px-4 py-[14px] active:opacity-70 ${
                    index > 0 ? 'border-t border-divider' : ''
                  } ${isSelected ? 'bg-info-tint' : ''}`}
                >
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                      isSelected ? 'border-brand-teal' : 'border-strong'
                    }`}
                  >
                    {isSelected && <View className="w-2.5 h-2.5 rounded-full bg-brand-teal" />}
                  </View>
                  <View className="flex-1">
                    <Text className={`text-[15px] ${item == null ? 'text-muted' : 'text-default'}`}>
                      {item?.name ?? noneLabel}
                    </Text>
                    {item?.detail != null && (
                      <Text className="mt-0.5 text-[12px] text-muted">
                        {item.detail}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
