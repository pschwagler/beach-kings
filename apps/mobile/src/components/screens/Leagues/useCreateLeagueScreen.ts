/**
 * Data hook for the Create League screen.
 *
 * On mount:
 *   - Loads all locations
 *   - Requests device location permission; if granted, fetches distances and
 *     auto-selects the closest location + its first court.
 *
 * On submit:
 *   - Creates the league
 *   - Attaches home court (non-fatal if it fails)
 *   - Creates an initial "Season 1" season (non-fatal if it fails)
 */

import { useState, useCallback, useEffect } from 'react';
import * as ExpoLocation from 'expo-location';
import { api } from '@/lib/api';
import type { Location, Court } from '@beach-kings/shared';

export type LeagueAccessType = 'open' | 'invite_only';
export type GenderOption = 'mens' | 'womens' | 'coed';
export type LevelOption = 'Open' | 'AA' | 'A' | 'BB' | 'B';

export interface LocationWithDistance extends Location {
  readonly distance_miles?: number | null;
}

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
  readonly locations: readonly LocationWithDistance[];
  readonly locationsLoading: boolean;
  readonly courts: readonly Court[];
  readonly courtsLoading: boolean;
  readonly locationModalOpen: boolean;
  readonly courtModalOpen: boolean;
  readonly onChangeName: (v: string) => void;
  readonly onChangeDescription: (v: string) => void;
  readonly onChangeAccessType: (v: LeagueAccessType) => void;
  readonly onChangeGender: (v: GenderOption) => void;
  readonly onChangeLevel: (v: LevelOption | '') => void;
  readonly onChangeLocation: (v: string) => void;
  readonly onChangeCourt: (v: number | null) => void;
  readonly onOpenLocationModal: () => void;
  readonly onCloseLocationModal: () => void;
  readonly onOpenCourtModal: () => void;
  readonly onCloseCourtModal: () => void;
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

export function useCreateLeagueScreen(): UseCreateLeagueScreenResult {
  const [form, setForm] = useState<CreateLeagueForm>({ ...DEFAULT_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [locations, setLocations] = useState<readonly LocationWithDistance[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const [courts, setCourts] = useState<readonly Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [courtModalOpen, setCourtModalOpen] = useState(false);

  const isValid = form.name.trim().length >= 2;

  // Load locations, then attempt GPS auto-select
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLocationsLoading(true);
      let baseLocations: readonly Location[] = [];
      try {
        baseLocations = await api.getLocations();
        if (!cancelled) setLocations(baseLocations);
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setLocationsLoading(false);
      }

      if (baseLocations.length === 0 || cancelled) return;

      // Request location permission — don't prompt if already denied
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;

        const position = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });

        const { latitude: lat, longitude: lon } = position.coords;
        const ranked = await api.getLocationDistances(lat, lon);
        if (cancelled || ranked.length === 0) return;

        const byId = new Map(ranked.map((r) => [r.id, r.distance_miles ?? null]));
        const withDistances: readonly LocationWithDistance[] = baseLocations.map((loc) => ({
          ...loc,
          distance_miles: byId.get(loc.id) ?? null,
        }));

        if (!cancelled) {
          setLocations(withDistances);
          // Auto-select closest location
          const closestId = String(ranked[0].id);
          setForm((prev) => ({ ...prev, location_id: closestId, court_id: null }));
        }
      } catch {
        // Permission denied or location unavailable — leave user to pick manually
      }
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  // Load courts when location changes; auto-select first court if set by GPS
  useEffect(() => {
    if (!form.location_id) {
      setCourts([]);
      return;
    }
    let cancelled = false;
    setCourtsLoading(true);
    api.getCourts({ location_id: form.location_id })
      .then((data) => {
        if (!cancelled) {
          setCourts(data);
          // Auto-select first court only when no court is chosen yet
          if (data.length > 0) {
            setForm((prev) => {
              if (prev.court_id != null) return prev;
              const firstId = typeof data[0].id === 'string'
                ? parseInt(data[0].id, 10)
                : data[0].id;
              return { ...prev, court_id: firstId };
            });
          }
        }
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

  const onOpenLocationModal = useCallback(() => setLocationModalOpen(true), []);
  const onCloseLocationModal = useCallback(() => setLocationModalOpen(false), []);
  const onOpenCourtModal = useCallback(() => setCourtModalOpen(true), []);
  const onCloseCourtModal = useCallback(() => setCourtModalOpen(false), []);

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

      // Attach home court (non-fatal)
      if (form.court_id != null) {
        try {
          await api.addLeagueHomeCourt(newId, form.court_id);
        } catch {
          // League created successfully; home court can be added later
        }
      }

      // Create an initial active season (non-fatal)
      try {
        await api.createLeagueSeason(newId, { name: 'Season 1', is_active: true });
      } catch {
        // League created successfully; season can be added later
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
  };
}
