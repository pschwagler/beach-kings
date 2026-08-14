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

import React, { useRef, useState, useMemo } from "react";
import AppText from '@/components/ui/AppText';
import {
  View,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import TopNav from "@/components/ui/TopNav";
import CourtPickerModal from "@/components/ui/CourtPickerModal";
import { usePaletteColors } from "@/theme/usePaletteColors";
import { hapticMedium, hapticLight } from "@/utils/haptics";
import { routes } from "@/lib/navigation";
import { formatDistance } from "@/lib/formatters";
import {
  useCreateLeagueScreen,
  type LeagueAccessType,
  type GenderOption,
  type LevelOption,
  type LocationWithDistance,
} from "./useCreateLeagueScreen";

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { readonly title: string }): React.ReactNode {
  return (
    <AppText className="text-[12px] font-semibold text-muted uppercase tracking-wider px-4 pt-5 pb-1">
      {title}
    </AppText>
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
  const options: Array<{ key: LeagueAccessType; label: string; desc: string }> =
    [
      { key: "open", label: "Open", desc: "Anyone can request to join" },
      {
        key: "invite_only",
        label: "Invite Only",
        desc: "Members join by invitation",
      },
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
              idx > 0 ? "border-t border-divider" : ""
            } active:opacity-70`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <View
              className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                isActive ? "border-brand-teal" : "border-strong"
              }`}
            >
              {isActive && (
                <View className="w-2.5 h-2.5 rounded-full bg-brand-teal" />
              )}
            </View>
            <View className="flex-1">
              <AppText className="text-[14px] font-semibold text-default">
                {label}
              </AppText>
              <AppText className="text-[12px] text-muted mt-[2px]">{desc}</AppText>
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
    { key: "mens", label: "Men's" },
    { key: "womens", label: "Women's" },
    { key: "coed", label: "Coed" },
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
              isActive
                ? "bg-brand-teal border-brand-teal"
                : "bg-surface border-strong"
            } active:opacity-70`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <AppText
              className={`text-[13px] font-semibold ${
                isActive ? "text-on-brand-teal" : "text-muted"
              }`}
            >
              {label}
            </AppText>
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
  readonly value: LevelOption | "";
  readonly onChange: (v: LevelOption | "") => void;
}

const LEVELS: LevelOption[] = ["Open", "AA", "A", "BB", "B"];

function LevelSelector({
  value,
  onChange,
}: LevelSelectorProps): React.ReactNode {
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
              onChange(isActive ? "" : lvl);
            }}
            className={`px-4 py-[10px] rounded-[8px] border ${
              isActive
                ? "bg-brand-teal border-brand-teal"
                : "bg-surface border-strong"
            } active:opacity-70`}
          >
            <AppText
              className={`text-[13px] font-semibold ${
                isActive ? "text-on-brand-teal" : "text-muted"
              }`}
            >
              {lvl}
            </AppText>
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
        disabled ? "opacity-40" : "active:opacity-70"
      }`}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View className="flex-1">
        <AppText className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-[2px]">
          {label}
        </AppText>
        {loading ? (
          <ActivityIndicator size="small" style={{ alignSelf: "flex-start" }} />
        ) : (
          <AppText
            className={`text-[15px] ${hasValue ? "text-default" : "text-muted"}`}
          >
            {hasValue ? value : placeholder}
          </AppText>
        )}
      </View>
      <AppText className="text-muted text-[18px] ml-2">›</AppText>
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
  const palette = usePaletteColors();
  const [query, setQuery] = useState("");

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
      <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
        <View className="flex-row items-center px-4 pt-2 pb-3 border-b border-divider">
          <AppText className="flex-1 text-[17px] font-semibold text-default">
            Select Location
          </AppText>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="active:opacity-70 py-1 pl-4"
          >
            <AppText className="text-[15px] font-semibold text-brand-teal">
              Done
            </AppText>
          </Pressable>
        </View>

        <View className="px-4 py-3 border-b border-divider">
          <View className="bg-surface rounded-[10px] flex-row items-center px-3 py-[10px]">
            <AppText className="text-muted mr-2">🔍</AppText>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search locations…"
              placeholderTextColor={palette.textTertiary}
              className="flex-1 text-[15px] text-default"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        <FlatList
          data={[
            {
              id: "",
              name: "None",
              city: "",
              state: "",
            } as LocationWithDistance,
            ...filtered,
          ]}
          keyExtractor={(item) => item.id ?? "none"}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const isNone = item.id === "";
            const isActive = selectedId === item.id;
            const label = isNone
              ? "None"
              : formatLabel(item as LocationWithDistance);
            return (
              <Pressable
                testID={`location-modal-option-${item.id || "none"}`}
                onPress={() => {
                  void hapticLight();
                  onSelect(item.id ?? "");
                  onClose();
                }}
                className={`flex-row items-center px-4 py-[14px] ${
                  index > 0 ? "border-t border-divider" : ""
                } active:opacity-70 ${isActive ? "bg-info-tint" : ""}`}
              >
                <View
                  className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                    isActive ? "border-brand-teal" : "border-strong"
                  }`}
                >
                  {isActive && (
                    <View className="w-2.5 h-2.5 rounded-full bg-brand-teal" />
                  )}
                </View>
                <AppText
                  className={`text-[15px] flex-1 ${
                    isNone
                      ? "text-muted"
                      : isActive
                        ? "font-semibold text-default"
                        : "text-default"
                  }`}
                >
                  {label}
                </AppText>
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
  const palette = usePaletteColors();
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
    ? (selectedLocation.name ??
      `${selectedLocation.city}, ${selectedLocation.state}`)
    : "";

  const selectedCourt = courts.find((c) => {
    const id = typeof c.id === "string" ? parseInt(c.id, 10) : c.id;
    return id === form.court_id;
  });
  const courtLabel = selectedCourt?.name ?? "";

  const cancelAction = (
    <Pressable
      testID="create-league-cancel"
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Cancel"
      className={`min-w-touch min-h-touch items-center justify-center active:opacity-70 ${
        !isValid || isSubmitting ? "opacity-disabled" : ""
      }`}
    >
      <AppText className="text-[14px] font-semibold text-inverse">Cancel</AppText>
    </Pressable>
  );

  const createAction = (
    <Pressable
      testID="create-league-submit"
      onPress={() => {
        void handleSubmit();
      }}
      disabled={!isValid || isSubmitting}
      accessibilityRole="button"
      accessibilityLabel="Create league"
      className="min-w-touch min-h-touch items-center justify-center active:opacity-70"
    >
      {isSubmitting ? (
        <ActivityIndicator size="small" color={palette.brandGold} />
      ) : (
        <AppText
          className="text-[14px] font-semibold text-brand-gold"
        >
          Create
        </AppText>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      <TopNav
        title="Create League"
        leftAction={cancelAction}
        rightAction={createAction}
      />

      <KeyboardAvoidingView
        testID="create-league-screen"
        className="flex-1 bg-page"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
              <AppText className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                League Name *
              </AppText>
              <TextInput
                testID="league-name-input"
                accessibilityLabel="League name"
                value={form.name}
                onChangeText={onChangeName}
                placeholder="e.g. QBK Open Men"
                placeholderTextColor={palette.textTertiary}
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
              <AppText className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                Description (optional)
              </AppText>
              <TextInput
                ref={descriptionRef}
                testID="league-description-input"
                accessibilityLabel="League description"
                value={form.description}
                onChangeText={onChangeDescription}
                placeholder="Describe your league…"
                placeholderTextColor={palette.textTertiary}
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
          <AccessToggle
            value={form.access_type}
            onChange={onChangeAccessType}
          />

          {/* ---- Settings ---- */}
          <SectionHeader title="Settings" />

          <View className="mb-3">
            <AppText className="text-[12px] text-muted px-4 mb-2">Gender</AppText>
            <GenderPills value={form.gender} onChange={onChangeGender} />
          </View>

          <View className="mb-3">
            <AppText className="text-[12px] text-muted px-4 mb-2">
              Skill Level
            </AppText>
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
              placeholder={
                form.location_id ? "Select court…" : "Select a location first"
              }
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
              <AppText className="text-[13px] text-danger">{submitError}</AppText>
            </View>
          )}

          {/* ---- Create button ---- */}
          <Pressable
            testID="create-league-button"
            onPress={() => {
              void handleSubmit();
            }}
            disabled={!isValid || isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Create league"
            className={`mx-4 mt-6 rounded-[12px] py-[16px] items-center justify-center ${
              isValid && !isSubmitting
                ? "bg-brand-gold active:opacity-80"
                : "bg-warning-tint"
            }`}
          >
            {isSubmitting ? (
              <ActivityIndicator color={palette.onBrandGold} />
            ) : (
              <AppText
                className={`text-[16px] font-bold ${
                  isValid ? "text-on-brand-gold" : "text-tertiary"
                }`}
              >
                Create League
              </AppText>
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
        courts={courts.flatMap((court) => {
          const id = Number(court.id);
          return Number.isFinite(id) ? [{ id, name: court.name }] : [];
        })}
        selectedCourtId={form.court_id}
        onSelect={(courtId) => {
          void hapticLight();
          onChangeCourt(courtId);
        }}
        onClose={onCloseCourtModal}
        title="Select Home Court"
        allowNone
        noneLabel="None"
        testIDPrefix="court-modal"
      />
    </SafeAreaView>
  );
}
