/**
 * Data hook for the Create League screen.
 *
 * Manages form state and submission. On success the caller receives the
 * new league id so the route can navigate to the league detail.
 */

import { useState, useCallback } from 'react';
import { mockApi } from '@/lib/mockApi';
import type { LeagueAccessType } from '@/lib/mockApi';

export type GenderOption = 'mens' | 'womens' | 'coed';
export type LevelOption = 'Open' | 'AA' | 'A' | 'BB' | 'B';

export interface CreateLeagueForm {
  name: string;
  description: string;
  access_type: LeagueAccessType;
  gender: GenderOption;
  level: LevelOption | '';
  home_court_name: string;
}

export interface UseCreateLeagueScreenResult {
  readonly form: CreateLeagueForm;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly isValid: boolean;
  readonly onChangeName: (v: string) => void;
  readonly onChangeDescription: (v: string) => void;
  readonly onChangeAccessType: (v: LeagueAccessType) => void;
  readonly onChangeGender: (v: GenderOption) => void;
  readonly onChangeLevel: (v: LevelOption | '') => void;
  readonly onChangeHomeCourt: (v: string) => void;
  readonly onSubmit: () => Promise<number | null>;
}

const DEFAULT_FORM: CreateLeagueForm = {
  name: '',
  description: '',
  access_type: 'open',
  gender: 'coed',
  level: '',
  home_court_name: '',
};

/**
 * Returns form state and submission handler for the Create League screen.
 */
export function useCreateLeagueScreen(): UseCreateLeagueScreenResult {
  const [form, setForm] = useState<CreateLeagueForm>({ ...DEFAULT_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isValid = form.name.trim().length >= 2 && form.gender !== undefined;

  const onChangeName = useCallback((v: string) => {
    setForm((prev) => ({ ...prev, name: v }));
    setSubmitError(null);
  }, []);

  const onChangeDescription = useCallback((v: string) => {
    setForm((prev) => ({ ...prev, description: v }));
  }, []);

  const onChangeAccessType = useCallback((v: LeagueAccessType) => {
    setForm((prev) => ({ ...prev, access_type: v }));
  }, []);

  const onChangeGender = useCallback((v: GenderOption) => {
    setForm((prev) => ({ ...prev, gender: v }));
  }, []);

  const onChangeLevel = useCallback((v: LevelOption | '') => {
    setForm((prev) => ({ ...prev, level: v }));
  }, []);

  const onChangeHomeCourt = useCallback((v: string) => {
    setForm((prev) => ({ ...prev, home_court_name: v }));
  }, []);

  const onSubmit = useCallback(async (): Promise<number | null> => {
    if (!isValid) return null;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await mockApi.createLeagueMock({
        name: form.name.trim(),
        description: form.description.trim() || null,
        access_type: form.access_type,
        gender: form.gender,
        level: form.level || null,
        home_court_id: null,
      });
      return result.id;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create league.';
      setSubmitError(message);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, isValid]);

  return {
    form,
    isSubmitting,
    submitError,
    isValid,
    onChangeName,
    onChangeDescription,
    onChangeAccessType,
    onChangeGender,
    onChangeLevel,
    onChangeHomeCourt,
    onSubmit,
  };
}
