/**
 * Data + state hook for the Session Edit screen.
 *
 * Pre-populates form from existing session detail.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import type { SessionType, SessionDetail } from '@/lib/mockApi';

export interface UseSessionEditScreenResult {
  readonly session: SessionDetail | null;
  readonly isLoading: boolean;
  readonly date: string;
  readonly startTime: string;
  readonly courtName: string;
  readonly sessionType: SessionType;
  readonly notes: string;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly setDate: (v: string) => void;
  readonly setStartTime: (v: string) => void;
  readonly setCourtName: (v: string) => void;
  readonly setSessionType: (v: SessionType) => void;
  readonly setNotes: (v: string) => void;
  readonly onSave: () => Promise<void>;
  readonly onCancel: () => void;
}

/**
 * Returns pre-populated form state and save handler for editing a session.
 * @param sessionId - numeric session id
 */
export function useSessionEditScreen(sessionId: number): UseSessionEditScreenResult {
  const router = useRouter();

  const { data: session, isLoading } = useApi<SessionDetail>(
    () => api.getSessionById(sessionId),
    [sessionId],
  );

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [courtName, setCourtName] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('pickup');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-fill form when session loads
  useEffect(() => {
    if (session != null) {
      setDate(session.date);
      setStartTime(session.start_time ?? '');
      setCourtName(session.court_name ?? '');
      setSessionType(session.session_type);
      setNotes(session.notes ?? '');
    }
  }, [session]);

  const onSave = useCallback(async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    await hapticMedium();
    try {
      await api.updateSession(sessionId, {
        date,
        start_time: startTime || null,
        court_name: courtName || null,
        session_type: sessionType,
        notes: notes || null,
      });
      router.back();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save changes.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionId, date, startTime, courtName, sessionType, notes, router]);

  const onCancel = useCallback(() => {
    router.back();
  }, [router]);

  return {
    session: session ?? null,
    isLoading,
    date,
    startTime,
    courtName,
    sessionType,
    notes,
    isSubmitting,
    submitError,
    setDate,
    setStartTime,
    setCourtName,
    setSessionType,
    setNotes,
    onSave,
    onCancel,
  };
}
