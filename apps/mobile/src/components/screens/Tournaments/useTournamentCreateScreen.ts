/**
 * Data + state hook for the Tournament Create screen.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import type { KobTournament } from '@beach-kings/shared';

export type TournamentGender = 'coed' | 'mens' | 'womens';
export type TournamentFormat = 'POOLS_PLAYOFFS' | 'FULL_ROUND_ROBIN';
export type RegistrationType = 'open' | 'invite';

export interface UseTournamentCreateScreenResult {
  readonly name: string;
  readonly scheduledDate: string;
  readonly maxPlayers: number;
  readonly numCourts: number;
  readonly gameTo: number;
  readonly scoreCap: number;
  readonly gender: TournamentGender;
  readonly format: TournamentFormat;
  readonly registrationType: RegistrationType;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly setName: (v: string) => void;
  readonly setScheduledDate: (v: string) => void;
  readonly setMaxPlayers: (v: number) => void;
  readonly setNumCourts: (v: number) => void;
  readonly setGameTo: (v: number) => void;
  readonly setScoreCap: (v: number) => void;
  readonly setGender: (v: TournamentGender) => void;
  readonly setFormat: (v: TournamentFormat) => void;
  readonly setRegistrationType: (v: RegistrationType) => void;
  readonly onSubmit: () => Promise<void>;
}

/** Returns form state and submit handler for creating a new tournament. */
export function useTournamentCreateScreen(): UseTournamentCreateScreenResult {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];

  const [name, setName] = useState('');
  const [scheduledDate, setScheduledDate] = useState(today);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [numCourts, setNumCourts] = useState(4);
  const [gameTo, setGameTo] = useState(21);
  const [scoreCap, setScoreCap] = useState(28);
  const [gender, setGender] = useState<TournamentGender>('coed');
  const [format, setFormat] = useState<TournamentFormat>('POOLS_PLAYOFFS');
  const [registrationType, setRegistrationType] = useState<RegistrationType>('open');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    if (name.trim().length === 0) {
      setSubmitError('Please enter a tournament name.');
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    await hapticMedium();
    try {
      const tournament = await api.createTournament({
        name: name.trim(),
        scheduled_date: scheduledDate,
        num_courts: numCourts,
        game_to: gameTo,
        gender,
        format,
      } as Partial<KobTournament>);
      router.replace(routes.tournament(tournament.id));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create tournament.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [name, scheduledDate, maxPlayers, numCourts, gameTo, scoreCap, gender, format, registrationType, router]);

  return {
    name,
    scheduledDate,
    maxPlayers,
    numCourts,
    gameTo,
    scoreCap,
    gender,
    format,
    registrationType,
    isSubmitting,
    submitError,
    setName,
    setScheduledDate,
    setMaxPlayers,
    setNumCourts,
    setGameTo,
    setScoreCap,
    setGender,
    setFormat,
    setRegistrationType,
    onSubmit,
  };
}
