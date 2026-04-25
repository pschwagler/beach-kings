/**
 * Data hook for the Create League screen.
 *
 * Manages form state and submission. On success the caller receives the
 * new league id so the route can navigate to the league detail.
 *
 * access_type is a UI concept; it is mapped to `is_open: boolean` before
 * sending to the backend ('open' → true, 'invite_only' → false).
 */

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Location, Court } from '@beach-kings/shared';

export type LeagueAccessType = 'open' | 'invite_only';
export type GenderOption = 'mens' | 'womens' | 'coed';
export type LevelOption = 'Open' | 'AA' | 'A' | 'BB' | 'B';

export interface CreateLeagueForm {
  name: string;
  description: string;
  access_type: LeagueAccessType;
  gender: GenderOption;
  level: LevelOption | '';
  location_id: string;
  court_id: number | null;
}

export interface UseCreateLeagueScreenResult {
  readonly form: CreateLeagueForm;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly isValid: boolean;
  readonly locations: readonly Location[];
  readonly locationsLoading: boolean;
  readonly courts: readonly Court[];
  readonly courtsLoading: boolean;
  readonly onChangeName: (v: string) => void;
  readonly onChangeDescription: (v: string) => void;
  readonly onChangeAccessType: (v: LeagueAccessType) => void;
  readonly onChangeGender: (v: GenderOption) => void;
  readonly onChangeLevel: (v: LevelOption | '') => void;
  readonly onChangeLocation: (v: string) => void;
  readonly onChangeCourt: (v: number | null) => void;
  readonly onSubmit: () => Promise<number | null>;
}

const DEFAULT_FORM: CreateLeagueForm = {
  name: '',
  description: '',
  access_type: 'open',
  gender: 'coed',
  level: '',
  location_id: '',
  court_id: null,
};

/**
 * Returns form state and submission handler for the Create League screen.
 *
 * Loads locations on mount. Loads courts when location_id changes.
 * On submit: calls api.createLeague, then optionally api.addLeagueHomeCourt
 * if a court was selected.
 */
export function useCreateLeagueScreen(): UseCreateLeagueScreenResult {
  const [form, setForm] = useState<CreateLeagueForm>({ ...DEFAULT_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [locations, setLocations] = useState<readonly Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const [courts, setCourts] = useState<readonly Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);

  const isValid = form.name.trim().length >= 2;

  // Load locations on mount
  useEffect(() => {
    let cancelled = false;
    setLocationsLoading(true);
    api.getLocations()
      .then((data) => {
        if (!cancelled) setLocations(data);
      })
      .catch(() => {
        // Non-fatal — location picker will just be empty
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Load courts when location changes
  useEffect(() => {
    if (!form.location_id) {
      setCourts([]);
      return;
    }
    let cancelled = false;
    setCourtsLoading(true);
    api.getCourts({ location_id: form.location_id })
      .then((data) => {
        if (!cancelled) setCourts(data);
      })
      .catch(() => {
        if (!cancelled) setCourts([]);
      })
      .finally(() => {
        if (!cancelled) setCourtsLoading(false);
      });
    return () => { cancelled = true; };
  }, [form.location_id]);

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

  const onChangeLocation = useCallback((v: string) => {
    setForm((prev) => ({ ...prev, location_id: v, court_id: null }));
  }, []);

  const onChangeCourt = useCallback((v: number | null) => {
    setForm((prev) => ({ ...prev, court_id: v }));
  }, []);

  const onSubmit = useCallback(async (): Promise<number | null> => {
    if (!isValid) return null;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        is_open: form.access_type === 'open',
        gender: form.gender,
      };
      if (form.description.trim()) {
        payload.description = form.description.trim();
      }
      if (form.level) {
        payload.level = form.level;
      }
      if (form.location_id) {
        payload.location_id = form.location_id;
      }

      const league = await api.createLeague(payload);
      const newId: number = league.id;

      // Attach the home court in a second call (creator is automatically admin)
      if (form.court_id != null) {
        try {
          await api.addLeagueHomeCourt(newId, form.court_id);
        } catch {
          // Non-fatal: league was created successfully, home court can be added later
        }
      }

      return newId;
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
    locations,
    locationsLoading,
    courts,
    courtsLoading,
    onChangeName,
    onChangeDescription,
    onChangeAccessType,
    onChangeGender,
    onChangeLevel,
    onChangeLocation,
    onChangeCourt,
    onSubmit,
  };
}
