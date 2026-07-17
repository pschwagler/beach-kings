import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { LeagueSeason } from '@beach-kings/shared';
import type { SeasonFormPayload } from './useLeagueInfoTab';

type ScoringSystem = 'points_system' | 'season_rating';

interface SeasonFormState {
  readonly name: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly scoring_system: ScoringSystem;
  readonly points_per_win: string;
  readonly points_per_loss: string;
}

interface ParsedScoring {
  readonly scoring_system: ScoringSystem;
  readonly points_per_win: number;
  readonly points_per_loss: number;
}

interface SeasonFormSheetProps {
  readonly visible: boolean;
  readonly mode: 'create' | 'edit';
  readonly season: LeagueSeason | null;
  readonly onClose: () => void;
  readonly onSubmit: (payload: SeasonFormPayload) => Promise<void>;
}

const SEASON_RATING_DESCRIPTION =
  'All players start with 100 points and use a season rating to compete for points based on team strength.';

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseScoring(season: LeagueSeason | null): ParsedScoring {
  let scoringSystem: ScoringSystem =
    season?.scoring_system === 'season_rating' ? 'season_rating' : 'points_system';
  let pointsPerWin = 3;
  let pointsPerLoss = 1;

  if (season?.point_system != null) {
    try {
      const config = JSON.parse(season.point_system) as {
        type?: string;
        points_per_win?: unknown;
        points_per_loss?: unknown;
      };
      if (season?.scoring_system == null && config.type === 'season_rating') {
        scoringSystem = 'season_rating';
      }
      if (typeof config.points_per_win === 'number') pointsPerWin = config.points_per_win;
      if (typeof config.points_per_loss === 'number') pointsPerLoss = config.points_per_loss;
    } catch {
      // Keep defaults when older point_system JSON is malformed.
    }
  }

  return {
    scoring_system: scoringSystem,
    points_per_win: pointsPerWin,
    points_per_loss: pointsPerLoss,
  };
}

function getInitialState(mode: 'create' | 'edit', season: LeagueSeason | null): SeasonFormState {
  if (mode === 'edit' && season != null) {
    const scoring = parseScoring(season);
    return {
      name: season.name ?? '',
      start_date: season.start_date ?? season.started_at ?? '',
      end_date: season.end_date ?? season.ended_at ?? '',
      scoring_system: scoring.scoring_system,
      points_per_win: String(scoring.points_per_win),
      points_per_loss: String(scoring.points_per_loss),
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 70);

  return {
    name: '',
    start_date: formatDate(today),
    end_date: formatDate(endDate),
    scoring_system: 'points_system',
    points_per_win: '3',
    points_per_loss: '1',
  };
}

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

interface FormFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly keyboardType?: 'default' | 'number-pad' | 'numeric';
  readonly testID: string;
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  testID,
}: FormFieldProps): React.ReactNode {
  return (
    <View className="py-[12px] border-b border-divider">
      <Text className="text-[12px] font-semibold text-muted mb-2">{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        keyboardType={keyboardType}
        className="text-[15px] text-default bg-elevated rounded-[8px] px-3 py-[10px]"
      />
    </View>
  );
}

export default function SeasonFormSheet({
  visible,
  mode,
  season,
  onClose,
  onSubmit,
}: SeasonFormSheetProps): React.ReactNode {
  const [form, setForm] = useState<SeasonFormState>(() => getInitialState(mode, season));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originalScoringSystem = useMemo(() => parseScoring(season).scoring_system, [season]);
  const scoringChanged =
    mode === 'edit' && season != null && form.scoring_system !== originalScoringSystem;
  const isSubmitDisabled = isSaving || form.start_date.trim() === '' || form.end_date.trim() === '';

  useEffect(() => {
    if (visible) {
      setForm(getInitialState(mode, season));
      setError(null);
      setIsSaving(false);
    }
  }, [visible, mode, season]);

  const setField = (field: keyof SeasonFormState, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (): Promise<void> => {
    const startDate = form.start_date.trim();
    const endDate = form.end_date.trim();

    if (startDate === '' || endDate === '') {
      setError('Start date and end date are required.');
      return;
    }

    if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
      setError('Dates must use YYYY-MM-DD.');
      return;
    }

    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }

    const payload: SeasonFormPayload = {
      name: form.name.trim() === '' ? undefined : form.name.trim(),
      start_date: startDate,
      end_date: endDate,
      scoring_system: form.scoring_system,
    };

    if (form.scoring_system === 'points_system') {
      payload.points_per_win = parseInteger(form.points_per_win, 3);
      payload.points_per_loss = parseInteger(form.points_per_loss, 1);
    }

    setIsSaving(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch {
      setError(mode === 'create' ? 'Failed to create season.' : 'Failed to update season.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      testID="season-form-sheet"
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/40">
        <Pressable testID="season-form-backdrop" className="flex-1" onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="bg-surface rounded-t-[20px] max-h-[88%]">
            <View className="px-4 pt-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-[18px] font-bold text-default">
                  {mode === 'create' ? 'New Season' : 'Edit Season'}
                </Text>
                <Pressable
                  testID="close-season-form"
                  onPress={onClose}
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Text className="text-[14px] font-semibold text-brand-teal">Done</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              testID="season-form-scroll"
              className="px-4"
              contentContainerStyle={{ paddingBottom: 12 }}
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <FormField
                testID="season-name-input"
                label="Season name"
                value={form.name}
                onChangeText={(value) => setField('name', value)}
                placeholder={`e.g., Spring ${new Date().getFullYear()}`}
              />
              <FormField
                testID="season-start-date-input"
                label="Start date"
                value={form.start_date}
                onChangeText={(value) => setField('start_date', value)}
                placeholder="YYYY-MM-DD"
              />
              <FormField
                testID="season-end-date-input"
                label="End date"
                value={form.end_date}
                onChangeText={(value) => setField('end_date', value)}
                placeholder="YYYY-MM-DD"
              />

              <View className="py-[12px] border-b border-divider">
                <Text className="text-[12px] font-semibold text-muted mb-2">Scoring system</Text>
                <View className="flex-row gap-2">
                  {[
                    { label: 'Points System', value: 'points_system' as const },
                    { label: 'Season Rating', value: 'season_rating' as const },
                  ].map((option) => {
                    const selected = form.scoring_system === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        testID={`scoring-${option.value}`}
                        onPress={() => setField('scoring_system', option.value)}
                        className={`flex-1 items-center rounded-[8px] border px-3 py-[10px] active:opacity-75 ${
                          selected ? 'border-brand-teal bg-info-tint' : 'border-divider bg-elevated'
                        }`}
                      >
                        <Text
                          className={`text-[12px] font-bold ${
                            selected ? 'text-brand-teal' : 'text-muted'
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {scoringChanged && (
                  <Text testID="season-scoring-warning" className="text-[12px] text-warning mt-2">
                    Changing scoring system will recalculate all stats.
                  </Text>
                )}
              </View>

              {form.scoring_system === 'points_system' ? (
                <>
                  <FormField
                    testID="points-per-win-input"
                    label="Points per win"
                    value={form.points_per_win}
                    onChangeText={(value) => setField('points_per_win', value)}
                    keyboardType="number-pad"
                  />
                  <FormField
                    testID="points-per-loss-input"
                    label="Points per loss"
                    value={form.points_per_loss}
                    onChangeText={(value) => setField('points_per_loss', value)}
                    keyboardType="default"
                  />
                </>
              ) : (
                <View className="bg-info-tint rounded-[8px] px-3 py-3 mt-3">
                  <Text className="text-[12px] text-default">{SEASON_RATING_DESCRIPTION}</Text>
                </View>
              )}

              {error != null && (
                <Text testID="season-form-error" className="text-[12px] text-danger mt-3">
                  {error}
                </Text>
              )}
            </ScrollView>

            <View
              testID="season-form-footer"
              className="flex-row gap-3 border-t border-divider px-4 pt-3 pb-8 bg-surface"
            >
              <Pressable
                testID="season-cancel-btn"
                onPress={onClose}
                className="flex-1 items-center rounded-[8px] border border-divider py-[12px] active:opacity-70"
              >
                <Text className="text-[13px] font-bold text-muted">Cancel</Text>
              </Pressable>
              <Pressable
                testID="season-submit-btn"
                onPress={() => {
                  void handleSubmit();
                }}
                disabled={isSubmitDisabled}
                className={`flex-1 items-center rounded-[8px] py-[12px] ${
                  isSubmitDisabled ? 'bg-elevated opacity-60' : 'bg-brand-teal active:opacity-80'
                }`}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text className="text-[13px] font-bold text-white">
                    {mode === 'create' ? 'Create' : 'Update'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
