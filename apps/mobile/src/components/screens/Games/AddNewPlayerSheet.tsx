/**
 * AddNewPlayerSheet — form sheet for creating a new placeholder player.
 *
 * Shown when the user types a name in RosterPicker that has no Beach League
 * match and taps "Add '<query>' as a New Player". Collects first/last name,
 * optional level and gender chips, then calls `onCreate` to persist the
 * placeholder. Stays open on failure and shows an inline error.
 *
 * Mirrors mobile-audit/wireframes/score-add-guest.html for layout/copy.
 */

import React, { useState, useEffect } from 'react';
import { Pressable, View, Text, ScrollView } from 'react-native';
import type { PlayerGender, SkillLevel } from '@beach-kings/shared';
import { GENDER_OPTIONS, SKILL_LEVEL_OPTIONS } from '@beach-kings/shared';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddNewPlayerSheetProps {
  readonly visible: boolean;
  /** Raw search query that triggered the sheet, e.g. "Brad K". Split on first
   *  space → first/last prefill. */
  readonly prefillName: string;
  readonly inferredGender: PlayerGender | null;
  readonly inferredLevel: SkillLevel | null;
  /** Rejects on failure → sheet shows inline error and STAYS open. On success
   *  the parent flips `visible` to false. */
  readonly onCreate: (data: {
    readonly first: string;
    readonly last: string;
    readonly gender: PlayerGender | null;
    readonly level: SkillLevel | null;
  }) => Promise<void>;
  readonly onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Splits a raw name string on the first whitespace character.
 * Returns `{ first, last }` where `last` may be an empty string.
 */
function splitPrefillName(raw: string): { first: string; last: string } {
  const trimmed = raw.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { first: trimmed, last: '' };
  }
  return {
    first: trimmed.slice(0, spaceIdx),
    last: trimmed.slice(spaceIdx + 1),
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SelectChipProps {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

/**
 * Inline chip for level/gender selection. Mirrors the Chip UI component but
 * exposes a `testID` on the Pressable (the shared Chip primitive does not
 * forward testID).
 */
function SelectChip({ label, active, onPress, testID }: SelectChipProps): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      className={`min-h-touch items-center justify-center px-md rounded-full ${
        active ? 'bg-brand-teal' : 'bg-elevated'
      }`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text
        className={`text-sm font-medium ${
          active ? 'text-white' : 'text-default'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface SubmitButtonProps {
  readonly title: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly testID: string;
}

/**
 * Primary submit button with testID forwarded. The shared Button primitive
 * does not forward testID, so we render a Pressable directly matching its
 * primary variant style.
 */
function SubmitButton({ title, onPress, disabled, loading, testID }: SubmitButtonProps): React.ReactNode {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      className={`min-h-touch rounded-lg items-center justify-center px-lg bg-brand-teal ${
        disabled ? 'opacity-50' : ''
      }`}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      <Text className="font-semibold text-body text-white">{title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AddNewPlayerSheet({
  visible,
  prefillName,
  inferredGender,
  inferredLevel,
  onCreate,
  onCancel,
}: AddNewPlayerSheetProps): React.ReactNode {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [gender, setGender] = useState<PlayerGender | null>(null);
  const [level, setLevel] = useState<SkillLevel | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Seed local state each time the sheet becomes visible so it reflects the
  // current search query and inferred values without retaining stale data.
  useEffect(() => {
    if (!visible) return;
    const { first: f, last: l } = splitPrefillName(prefillName);
    setFirst(f);
    setLast(l);
    setGender(inferredGender);
    setLevel(inferredLevel);
    setIsCreating(false);
    setErrorMsg(null);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  // Intentionally depending only on `visible` — when the sheet re-opens we
  // re-seed from the latest prefill/inferred props at that moment.

  const trimmedFirst = first.trim();
  const trimmedLast = last.trim();

  const displayName =
    [trimmedFirst, trimmedLast].filter(Boolean).join(' ') || null;

  const submitLabel = displayName ? `Add ${displayName} to Game` : 'Add Player';
  const isSubmitDisabled = trimmedFirst.length === 0 || isCreating;

  const handleLevelPress = (value: SkillLevel) => {
    setLevel((prev) => (prev === value ? null : value));
  };

  const handleGenderPress = (value: PlayerGender) => {
    setGender((prev) => (prev === value ? null : value));
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    setIsCreating(true);
    try {
      await onCreate({
        first: trimmedFirst,
        last: trimmedLast,
        gender,
        level,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      setErrorMsg(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onCancel}
      title="Add New Player"
    >
      <ScrollView
        testID="add-new-player-sheet"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Subtitle */}
        <Text className="text-muted text-sm mt-sm mb-lg">
          Creates a profile they can claim later by joining Beach League.
        </Text>

        {/* Search context — omit when prefillName is empty */}
        {prefillName.trim().length > 0 && (
          <View className="flex-row items-center gap-xs mb-md py-sm px-md rounded-lg bg-inset">
            <Text className="text-muted text-sm flex-1">
              {`No Beach League match for "${prefillName}"`}
            </Text>
          </View>
        )}

        {/* First Name */}
        <View className="mb-md">
          <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-xs">
            First Name{' '}
            <Text className="text-danger normal-case font-normal text-xs">*</Text>
          </Text>
          <Input
            testID="add-new-player-first"
            value={first}
            onChangeText={setFirst}
            placeholder="First name"
            autoCapitalize="words"
            autoComplete="name-given"
          />
        </View>

        {/* Last Name */}
        <View className="mb-md">
          <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-xs">
            Last Name{' '}
            <Text className="text-tertiary normal-case font-normal text-xs">
              (optional)
            </Text>
          </Text>
          <Input
            testID="add-new-player-last"
            value={last}
            onChangeText={setLast}
            placeholder="Last name"
            autoCapitalize="words"
            autoComplete="name-family"
          />
        </View>

        {/* Level chips */}
        <View className="mb-md">
          <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-xs">
            Level{' '}
            <Text className="text-tertiary normal-case font-normal text-xs">
              (optional)
            </Text>
          </Text>
          <View className="flex-row flex-wrap gap-xs">
            {SKILL_LEVEL_OPTIONS.map((opt) => (
              <SelectChip
                key={opt.value}
                testID={`add-new-player-level-${opt.value}`}
                label={opt.label}
                active={level === opt.value}
                onPress={() => handleLevelPress(opt.value as SkillLevel)}
              />
            ))}
          </View>
        </View>

        {/* Gender chips */}
        <View className="mb-lg">
          <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-xs">
            Gender{' '}
            <Text className="text-tertiary normal-case font-normal text-xs">
              (optional)
            </Text>
          </Text>
          <View className="flex-row gap-xs">
            {GENDER_OPTIONS.map((opt) => (
              <SelectChip
                key={opt.value}
                testID={`add-new-player-gender-${opt.value}`}
                label={opt.label}
                active={gender === opt.value}
                onPress={() => handleGenderPress(opt.value as PlayerGender)}
              />
            ))}
          </View>
        </View>

        {/* Info callout
            The amber/warm tones (#fffbeb bg, #92400e text) have no semantic
            token — bg-warning-tint is used for the container bg (closest
            available warm tint), and inline style is used for the text color
            to match the wireframe amber callout exactly. This mirrors the
            established pattern for the few raw-color exceptions in the Games
            screens where no semantic token covers the exact wireframe intent. */}
        <View
          className="rounded-xl mb-lg px-md py-sm bg-warning-tint"
          style={{ borderWidth: 1, borderColor: '#fde68a' }}
        >
          <Text
            className="text-sm leading-5"
            // eslint-disable-next-line no-restricted-syntax -- wireframe amber callout: no semantic token covers #92400e
            style={{ color: '#92400e' }}
          >
            <Text style={{ fontWeight: '700', color: '#92400e' }}>
              New players
            </Text>
            {' '}appear in session rosters with a &ldquo;New&rdquo; label.
            Share a link after the session so they can join Beach League and own
            their stats.
          </Text>
        </View>

        {/* Inline error */}
        {errorMsg !== null && (
          <Text
            testID="add-new-player-error"
            className="text-danger text-sm mb-md"
          >
            {errorMsg}
          </Text>
        )}

        {/* Submit */}
        <SubmitButton
          testID="add-new-player-submit"
          title={submitLabel}
          onPress={() => { void handleSubmit(); }}
          disabled={isSubmitDisabled}
          loading={isCreating}
        />

        {/* Cancel */}
        <View className="mt-sm">
          <Button
            title="Cancel"
            onPress={onCancel}
            variant="ghost"
          />
        </View>
      </ScrollView>
    </Modal>
  );
}
