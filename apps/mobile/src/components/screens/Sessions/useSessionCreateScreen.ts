/**
 * Data + state hook for the Session Create screen.
 *
 * Manages form state (date, time, court, type, max players, notes) and
 * handles the create submission flow.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import type { SessionType } from '@beach-kings/shared';

export interface UseSessionCreateScreenResult {
  readonly date: string;
  readonly startTime: string;
  readonly courtName: string;
  readonly sessionType: SessionType;
  readonly maxPlayers: number;
  readonly notes: string;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly setDate: (v: string) => void;
  readonly setStartTime: (v: string) => void;
  readonly setCourtName: (v: string) => void;
  readonly setSessionType: (v: SessionType) => void;
  readonly setMaxPlayers: (v: number) => void;
  readonly setNotes: (v: string) => void;
  readonly onSubmit: () => Promise<void>;
}

/** Returns form state and submit handler for creating a new session. */
export function useSessionCreateScreen(): UseSessionCreateScreenResult {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [courtName, setCourtName] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('pickup');
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    await hapticMedium();
    try {
      const session = await api.createSession({
        date,
        start_time: startTime || null,
        court_name: courtName || null,
        session_type: sessionType,
        max_players: maxPlayers,
        notes: notes || null,
      });
      router.replace(routes.session(session.id));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create session.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [date, startTime, courtName, sessionType, maxPlayers, notes, router]);

  return {
    date,
    startTime,
    courtName,
    sessionType,
    maxPlayers,
    notes,
    isSubmitting,
    submitError,
    setDate,
    setStartTime,
    setCourtName,
    setSessionType,
    setMaxPlayers,
    setNotes,
    onSubmit,
  };
}
