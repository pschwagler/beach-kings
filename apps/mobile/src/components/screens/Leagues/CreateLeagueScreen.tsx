/**
 * CreateLeagueScreen — form to create a new league.
 *
 * Sections:
 *   League Details (Name, Description, Access toggle)
 *   Settings (Gender pills, Level select, Location row, Home Court row)
 *   Create button (gold/disabled until valid)
 *
 * Location and Home Court open full-screen search modals.
 * On mount the hook requests device location and auto-selects the closest
 * location + first court so the user rarely needs to touch these fields.
 */

import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import { formatDistance } from '@/lib/formatters';
import {
  useCreateLeagueScreen,
  type LeagueAccessType,
  type GenderOption,
  type LevelOption,
  type LocationWithDistance,
} from './useCreateLeagueScreen';
import type { Court } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { readonly title: string }): React.ReactNode {
  return (
    <Text className="text-[12px] font-semibold text-muted uppercase tracking-wider px-4 pt-5 pb-1">
      {title}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Access toggle
// ---------------------------------------------------------------------------

interface AccessToggleProps {
  readonly value: LeagueAccessType;
  readonly onChange: (v: LeagueAccessType) => void;
}

function AccessToggle({ value, onChange }: AccessToggleProps): React.ReactNode {
  const options: Array<{ key: LeagueAccessType; label: string; desc: string }> = [
    { key: 'open', label: 'Open', desc: 'Anyone can request to join' },
    { key: 'invite_only', label: 'Invite Only', desc: 'Members join by invitation' },
  ];

  return (
    <View className="mx-4 rounded-[12px] border border-divider overflow-hidden bg-surface">
      {options.map(({ key, label, desc }, idx) => {
        const isActive = value === key;
        return (
          <Pressable
            key={key}
            testID={`access-toggle-${key}`}
            onPress={() => {
              void hapticLight();
              onChange(key);
            }}
            className={`flex-row items-center px-4 py-[14px] ${
              idx > 0 ? 'border-t border-divider' : ''
            } active:opacity-70`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <View
              className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                isActive ? 'border-brand-teal' : 'border-strong'
              }`}
            >
              {isActive && (
                <View className="w-2.5 h-2.5 rounded-full bg-brand-teal" />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-default">{label}</Text>
              <Text className="text-[12px] text-muted mt-[2px]">{desc}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Gender pill selector
// ---------------------------------------------------------------------------

interface GenderPillsProps {
  readonly value: GenderOption;
  readonly onChange: (v: GenderOption) => void;
}

function GenderPills({ value, onChange }: GenderPillsProps): React.ReactNode {
  const options: Array<{ key: GenderOption; label: string }> = [
    { key: 'mens', label: "Men's" },
    { key: 'womens', label: "Women's" },
    { key: 'coed', label: 'Coed' },
  ];

  return (
    <View className="flex-row gap-2 px-4">
      {options.map(({ key, label }) => {
        const isActive = value === key;
        return (
          <Pressable
            key={key}
            testID={`gender-pill-${key}`}
            onPress={() => {
              void hapticLight();
              onChange(key);
            }}
            className={`px-4 py-[10px] rounded-full border ${
              isActive ? 'bg-brand-teal border-brand-teal' : 'bg-surface border-strong'
            } active:opacity-70`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive ? 'text-white' : 'text-muted'
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Level selector
// ---------------------------------------------------------------------------

interface LevelSelectorProps {
  readonly value: LevelOption | '';
  readonly onChange: (v: LevelOption | '') => void;
}

const LEVELS: LevelOption[] = ['Open', 'AA', 'A', 'BB', 'B'];

function LevelSelector({ value, onChange }: LevelSelectorProps): React.ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2 px-4">
      {LEVELS.map((lvl) => {
        const isActive = value === lvl;
        return (
          <Pressable
            key={lvl}
            testID={`level-option-${lvl}`}
            onPress={() => {
              void hapticLight();
              onChange(isActive ? '' : lvl);
            }}
            className={`px-4 py-[10px] rounded-[8px] border ${
              isActive ? 'bg-brand-teal border-brand-teal' : 'bg-surface border-strong'
            } active:opacity-70`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive ? 'text-white' : 'text-muted'
              }`}
            >
              {lvl}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Compact picker row (tappable, opens a modal)
// ---------------------------------------------------------------------------

interface PickerRowProps {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
  readonly onPress: () => void;
}

function PickerRow({
  label,
  value,
  placeholder,
  loading = false,
  disabled = false,
  testID,
  onPress,
}: PickerRowProps): React.ReactNode {
  const hasValue = value.length > 0;
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (disabled || loading) return;
        void hapticLight();
        onPress();
      }}
      disabled={disabled || loading}
      className={`flex-row items-center px-4 py-[14px] ${
        disabled ? 'opacity-40' : 'active:opacity-70'
      }`}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View className="flex-1">
        <Text className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-[2px]">
          {label}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" style={{ alignSelf: 'flex-start' }} />
        ) : (
          <Text className={`text-[15px] ${hasValue ? 'text-default' : 'text-muted'}`}>
            {hasValue ? value : placeholder}
          </Text>
        )}
      </View>
      <Text className="text-muted text-[18px] ml-2">›</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Location picker modal
// ---------------------------------------------------------------------------

interface LocationPickerModalProps {
  readonly visible: boolean;
  readonly locations: readonly LocationWithDistance[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
}

function LocationPickerModal({
  visible,
  locations,
  selectedId,
  onSelect,
  onClose,
}: LocationPickerModalProps): React.ReactNode {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const sorted = [...locations].sort((a, b) => {
      const da = a.distance_miles ?? Infinity;
      const db = b.distance_miles ?? Infinity;
      return da - db;
    });
    if (!q) return sorted;
    return sorted.filter((loc) => {
      const name = loc.name ?? `${loc.city}, ${loc.state}`;
      return name.toLowerCase().includes(q);
    });
  }, [locations, query]);

  const formatLabel = (loc: LocationWithDistance): string => {
    const name = loc.name ?? `${loc.city}, ${loc.state}`;
    const distance = formatDistance(loc.distance_miles, 0);
    return distance ? `${name} · ${distance}` : name;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-page" edges={['top']}>
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-divider">
          <Text className="flex-1 text-[17px] font-semibold text-default">
            Select Location
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="active:opacity-70 py-1 pl-4"
          >
            <Text className="text-[15px] font-semibold text-brand-teal">Done</Text>
          </Pressable>
        </View>

        <View className="px-4 py-3 border-b border-divider">
          <View className="bg-surface rounded-[10px] flex-row items-center px-3 py-[10px]">
            <Text className="text-muted mr-2">🔍</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search locations…"
              placeholderTextColor="#aaa"
              className="flex-1 text-[15px] text-default"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        <FlatList
          data={[{ id: '', name: 'None', city: '', state: '' } as LocationWithDistance, ...filtered]}
          keyExtractor={(item) => item.id ?? 'none'}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const isNone = item.id === '';
            const isActive = selectedId === item.id;
            const label = isNone ? 'None' : formatLabel(item as LocationWithDistance);
            return (
              <Pressable
                testID={`location-modal-option-${item.id || 'none'}`}
                onPress={() => {
                  void hapticLight();
                  onSelect(item.id ?? '');
                  onClose();
                }}
                className={`flex-row items-center px-4 py-[14px] ${
                  index > 0 ? 'border-t border-divider' : ''
                } active:opacity-70 ${isActive ? 'bg-brand-teal/10' : ''}`}
              >
                <View
                  className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                    isActive ? 'border-brand-teal' : 'border-strong'
                  }`}
                >
                  {isActive && (
                    <View className="w-2.5 h-2.5 rounded-full bg-brand-teal" />
                  )}
                </View>
                <Text
                  className={`text-[15px] flex-1 ${
                    isNone ? 'text-muted' : isActive ? 'font-semibold text-default' : 'text-default'
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Court picker modal
// ---------------------------------------------------------------------------

interface CourtPickerModalProps {
  readonly visible: boolean;
  readonly courts: readonly Court[];
  readonly selectedId: number | null;
  readonly onSelect: (id: number | null) => void;
  readonly onClose: () => void;
}

function CourtPickerModal({
  visible,
  courts,
  selectedId,
  onSelect,
  onClose,
}: CourtPickerModalProps): React.ReactNode {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return courts;
    return courts.filter((c) => c.name.toLowerCase().includes(q));
  }, [courts, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-page" edges={['top']}>
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-divider">
          <Text className="flex-1 text-[17px] font-semibold text-default">
            Select Home Court
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="active:opacity-70 py-1 pl-4"
          >
            <Text className="text-[15px] font-semibold text-brand-teal">Done</Text>
          </Pressable>
        </View>

        <View className="px-4 py-3 border-b border-divider">
          <View className="bg-surface rounded-[10px] flex-row items-center px-3 py-[10px]">
            <Text className="text-muted mr-2">🔍</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search courts…"
              placeholderTextColor="#aaa"
              className="flex-1 text-[15px] text-default"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        <FlatList
          data={[{ id: null, name: 'None' } as unknown as Court, ...filtered]}
          keyExtractor={(item) => String(item.id ?? 'none')}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const isNone = item.id == null;
            const courtId = isNone
              ? null
              : typeof item.id === 'string'
                ? parseInt(item.id, 10)
                : item.id;
            const isActive = selectedId === courtId;
            return (
              <Pressable
                testID={`court-modal-option-${item.id ?? 'none'}`}
                onPress={() => {
                  void hapticLight();
                  onSelect(courtId);
                  onClose();
                }}
                className={`flex-row items-center px-4 py-[14px] ${
                  index > 0 ? 'border-t border-divider' : ''
                } active:opacity-70 ${isActive ? 'bg-brand-teal/10' : ''}`}
              >
                <View
                  className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                    isActive ? 'border-brand-teal' : 'border-strong'
                  }`}
                >
                  {isActive && (
                    <View className="w-2.5 h-2.5 rounded-full bg-brand-teal" />
                  )}
                </View>
                <Text
                  className={`text-[15px] flex-1 ${
                    isNone ? 'text-muted' : isActive ? 'font-semibold text-default' : 'text-default'
                  }`}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CreateLeagueScreen(): React.ReactNode {
  const router = useRouter();
  const {
    form,
    isSubmitting,
    submitError,
    isValid,
    locations,
    locationsLoading,
    courts,
    courtsLoading,
    locationModalOpen,
    courtModalOpen,
    onChangeName,
    onChangeDescription,
    onChangeAccessType,
    onChangeGender,
    onChangeLevel,
    onChangeLocation,
    onChangeCourt,
    onOpenLocationModal,
    onCloseLocationModal,
    onOpenCourtModal,
    onCloseCourtModal,
    onSubmit,
  } = useCreateLeagueScreen();

  const descriptionRef = useRef<TextInput>(null);

  const handleSubmit = async (): Promise<void> => {
    void hapticMedium();
    const newId = await onSubmit();
    if (newId != null) {
      router.push(routes.league(newId));
    }
  };

  const selectedLocation = locations.find((l) => l.id === form.location_id);
  const locationLabel = selectedLocation
    ? selectedLocation.name ?? `${selectedLocation.city}, ${selectedLocation.state}`
    : '';

  const selectedCourt = courts.find((c) => {
    const id = typeof c.id === 'string' ? parseInt(c.id, 10) : c.id;
    return id === form.court_id;
  });
  const courtLabel = selectedCourt?.name ?? '';

  const cancelAction = (
    <Pressable
      testID="create-league-cancel"
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Cancel"
      className="min-w-touch min-h-touch items-center justify-center active:opacity-70"
    >
      <Text className="text-[14px] font-semibold text-white">Cancel</Text>
    </Pressable>
  );

  const createAction = (
    <Pressable
      testID="create-league-submit"
      onPress={() => { void handleSubmit(); }}
      disabled={!isValid || isSubmitting}
      accessibilityRole="button"
      accessibilityLabel="Create league"
      className="min-w-touch min-h-touch items-center justify-center active:opacity-70"
    >
      {isSubmitting ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text
          className={`text-[14px] font-semibold ${
            isValid ? 'text-white' : 'text-white/40'
          }`}
        >
          Create
        </Text>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav title="Create League" leftAction={cancelAction} rightAction={createAction} />

      <KeyboardAvoidingView
        testID="create-league-screen"
        className="flex-1 bg-page"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ---- League Details ---- */}
          <SectionHeader title="League Details" />

          <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden">
            <View className="px-4 pt-[14px] pb-[10px]">
              <Text className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                League Name *
              </Text>
              <TextInput
                testID="league-name-input"
                value={form.name}
                onChangeText={onChangeName}
                placeholder="e.g. QBK Open Men"
                placeholderTextColor="#aaa"
                className="text-[16px] text-default"
                returnKeyType="next"
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="off"
                textContentType="organizationName"
                maxLength={80}
                onSubmitEditing={() => descriptionRef.current?.focus()}
              />
            </View>

            <View className="h-[1px] bg-divider mx-4" />

            <View className="px-4 pt-[14px] pb-[10px]">
              <Text className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                Description (optional)
              </Text>
              <TextInput
                ref={descriptionRef}
                testID="league-description-input"
                value={form.description}
                onChangeText={onChangeDescription}
                placeholder="Describe your league…"
                placeholderTextColor="#aaa"
                className="text-[15px] text-default"
                multiline
                numberOfLines={3}
                returnKeyType="default"
                autoCapitalize="sentences"
                autoCorrect
                maxLength={500}
                style={{ minHeight: 64 }}
              />
            </View>
          </View>

          {/* ---- Access ---- */}
          <SectionHeader title="Access" />
          <AccessToggle value={form.access_type} onChange={onChangeAccessType} />

          {/* ---- Settings ---- */}
          <SectionHeader title="Settings" />

          <View className="mb-3">
            <Text className="text-[12px] text-muted px-4 mb-2">Gender</Text>
            <GenderPills value={form.gender} onChange={onChangeGender} />
          </View>

          <View className="mb-3">
            <Text className="text-[12px] text-muted px-4 mb-2">Skill Level</Text>
            <LevelSelector value={form.level} onChange={onChangeLevel} />
          </View>

          {/* Location + Home Court picker rows */}
          <View className="bg-surface rounded-[12px] mx-4 border border-divider overflow-hidden mt-1">
            <PickerRow
              testID="location-picker-row"
              label="Location (optional)"
              value={locationLabel}
              placeholder="Select location…"
              loading={locationsLoading}
              onPress={onOpenLocationModal}
            />
            <View className="h-[1px] bg-divider" />
            <PickerRow
              testID="court-picker-row"
              label="Home Court (optional)"
              value={courtLabel}
              placeholder={form.location_id ? 'Select court…' : 'Select a location first'}
              loading={courtsLoading}
              disabled={!form.location_id}
              onPress={onOpenCourtModal}
            />
          </View>

          {/* ---- Error ---- */}
          {submitError != null && (
            <View
              testID="submit-error"
              className="mx-4 mt-4 bg-danger-tint rounded-[10px] p-3"
            >
              <Text className="text-[13px] text-danger">{submitError}</Text>
            </View>
          )}

          {/* ---- Create button ---- */}
          <Pressable
            testID="create-league-button"
            onPress={() => { void handleSubmit(); }}
            disabled={!isValid || isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Create league"
            className={`mx-4 mt-6 rounded-[12px] py-[16px] items-center justify-center ${
              isValid && !isSubmitting ? 'bg-brand-gold active:opacity-80' : 'bg-brand-gold/30'
            }`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                className={`text-[16px] font-bold ${
                  isValid ? 'text-white' : 'text-tertiary'
                }`}
              >
                Create League
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modals */}
      <LocationPickerModal
        visible={locationModalOpen}
        locations={locations}
        selectedId={form.location_id}
        onSelect={onChangeLocation}
        onClose={onCloseLocationModal}
      />
      <CourtPickerModal
        visible={courtModalOpen}
        courts={courts}
        selectedId={form.court_id}
        onSelect={onChangeCourt}
        onClose={onCloseCourtModal}
      />
    </SafeAreaView>
  );
}
