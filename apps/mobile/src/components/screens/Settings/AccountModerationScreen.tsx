import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import AppText from '@/components/ui/AppText';
import TopNav from '@/components/ui/TopNav';
import { useAuth } from '@/contexts/AuthContext';
import { moderationKeys, moderationQueries } from '@/features/moderation';
import { api } from '@/lib/api';
import { usePaletteColors } from '@/theme/usePaletteColors';
import DeleteAccountDialog from './DeleteAccountDialog';

interface AccountModerationScreenProps {
  readonly fullAccount?: boolean;
}

function formatExpiry(value: string | null): string | null {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AccountModerationScreen({
  fullAccount = false,
}: AccountModerationScreenProps): React.ReactNode {
  const { user, logout, refreshUser } = useAuth();
  const palette = usePaletteColors();
  const queryClient = useQueryClient();
  const userId = user?.id ?? 0;
  const statusQuery = useQuery(moderationQueries.accountStatus(userId));
  const [statement, setStatement] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletionPending, setDeletionPending] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const status = statusQuery.data;
  const accountState = status?.account_status ?? user?.moderation_status ?? 'active';
  const restrictedUntil = status?.interaction_restricted_until ??
    user?.interaction_restricted_until ?? null;
  const caseId = status?.account_case_id ?? status?.interaction_restriction_case_id ??
    user?.moderation_case_id ?? user?.interaction_restriction_case_id ?? null;
  const caseAppeal = status?.appeals.find((appeal) => appeal.case_id === caseId);
  const openAppeal = caseAppeal?.status === 'open' ? caseAppeal : null;
  const resolvedAppeal = caseAppeal != null && caseAppeal.status !== 'open'
    ? caseAppeal
    : null;

  useEffect(() => {
    if (status?.account_status === 'active' &&
      user?.moderation_status !== 'active') {
      void refreshUser();
    }
  }, [refreshUser, status?.account_status, user?.moderation_status]);

  const appeal = useMutation({
    mutationFn: async () => {
      if (caseId == null) throw new Error('No appealable case');
      return api.createModerationAppeal({ case_id: caseId, statement: statement.trim() });
    },
    onSuccess: async () => {
      setStatement('');
      await queryClient.invalidateQueries({
        queryKey: moderationKeys.accountStatus(userId),
      });
    },
    onError: () => {
      Alert.alert('Appeal not sent', 'Please review your statement and try again.');
    },
  });

  const copy = useMemo(() => {
    if (accountState === 'banned') {
      return {
        title: 'Account banned',
        message: 'Your account cannot use Beach League. You can still review this decision, appeal, delete your account, or log out.',
        expiry: null,
      };
    }
    if (accountState === 'suspended') {
      return {
        title: 'Account suspended',
        message: 'Your account is temporarily unavailable. You can still review this decision, appeal, delete your account, or log out.',
        expiry: formatExpiry(status?.account_expires_at ?? user?.moderation_expires_at ?? null),
      };
    }
    if (restrictedUntil != null) {
      return {
        title: 'Social features limited',
        message: 'You can keep using Beach League and view shared league activity. Messaging, friend requests, invites, and public posting are temporarily unavailable.',
        expiry: formatExpiry(restrictedUntil),
      };
    }
    return {
      title: 'No account restrictions',
      message: 'Your account and social features are available.',
      expiry: null,
    };
  }, [accountState, restrictedUntil, status?.account_expires_at, user?.moderation_expires_at]);

  const canAppeal = caseId != null && caseAppeal == null &&
    (accountState !== 'active' || restrictedUntil != null);
  const statementValid = statement.trim().length >= 10;

  const scheduleDeletion = () => {
    setDeletionError(null);
    setDeletionPending(true);
    void api.scheduleAccountDeletion()
      .then(() => logout())
      .catch(() => setDeletionError('Could not schedule deletion. Please try again later.'))
      .finally(() => setDeletionPending(false));
  };

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']} testID="account-moderation-screen">
      {!fullAccount && <TopNav title="Account status" showBack />}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-lg py-2xl gap-lg"
        keyboardShouldPersistTaps="handled"
      >
        <View className="rounded-2xl border border-divider bg-surface p-xl gap-sm">
          <AppText className="text-2xl font-bold text-default">{copy.title}</AppText>
          <AppText className="text-[15px] leading-6 text-muted">{copy.message}</AppText>
          {copy.expiry != null && (
            <View className="mt-sm rounded-xl border border-divider bg-page px-md py-sm">
              <AppText className="text-[13px] font-semibold text-default">
                Scheduled until {copy.expiry}
              </AppText>
            </View>
          )}
          {caseId != null && (
            <AppText className="text-[12px] text-muted">Reference: case {caseId}</AppText>
          )}
        </View>

        {statusQuery.isLoading && (
          <ActivityIndicator color={palette.textMuted} accessibilityLabel="Loading account status" />
        )}

        {openAppeal != null && (
          <View className="rounded-2xl border border-divider bg-surface p-lg gap-xs">
            <AppText className="text-[16px] font-bold text-default">Appeal received</AppText>
            <AppText className="text-[14px] leading-5 text-muted">
              A moderator will review your appeal. The current restriction remains in place while it is reviewed.
            </AppText>
          </View>
        )}

        {resolvedAppeal != null && (
          <View className="rounded-2xl border border-divider bg-surface p-lg gap-xs">
            <AppText className="text-[16px] font-bold text-default">
              {resolvedAppeal.status === 'granted' ? 'Appeal granted' : 'Decision upheld'}
            </AppText>
            <AppText className="text-[14px] leading-5 text-muted">
              {resolvedAppeal.resolution_reason ?? (
                resolvedAppeal.status === 'granted'
                  ? 'The restriction linked to this case was removed.'
                  : 'A moderator reviewed the appeal and kept the current restriction in place.'
              )}
            </AppText>
          </View>
        )}

        {canAppeal && (
          <View className="rounded-2xl border border-divider bg-surface p-lg gap-md">
            <View className="gap-xs">
              <AppText className="text-[16px] font-bold text-default">Appeal this decision</AppText>
              <AppText className="text-[13px] leading-5 text-muted">
                Explain why you think this decision should be changed. Appeals are reviewed by a person.
              </AppText>
            </View>
            <TextInput
              testID="moderation-appeal-input"
              value={statement}
              onChangeText={setStatement}
              placeholder="Add context for the reviewer…"
              placeholderTextColor={palette.textMuted}
              multiline
              maxLength={2000}
              textAlignVertical="top"
              className="min-h-[132px] rounded-xl border border-default bg-page px-md py-md text-[15px] text-default"
            />
            <Pressable
              testID="moderation-appeal-submit"
              accessibilityRole="button"
              disabled={!statementValid || appeal.isPending}
              onPress={() => appeal.mutate()}
              className="min-h-touch items-center justify-center rounded-xl bg-brand-teal px-lg disabled:opacity-40 active:opacity-80"
            >
              {appeal.isPending ? (
                <ActivityIndicator color={palette.textInverse} />
              ) : (
                <AppText className="text-[15px] font-bold text-inverse">Submit appeal</AppText>
              )}
            </Pressable>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => void statusQuery.refetch()}
          className="min-h-touch items-center justify-center rounded-xl border border-default bg-surface px-lg active:opacity-70"
        >
          <AppText className="text-[15px] font-semibold text-default">Refresh status</AppText>
        </Pressable>

        {fullAccount && (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => void logout()}
              className="min-h-touch items-center justify-center rounded-xl border border-default bg-surface px-lg active:opacity-70"
            >
              <AppText className="text-[15px] font-semibold text-default">Log out</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowDeleteConfirm(true)}
              className="min-h-touch items-center justify-center rounded-xl px-lg active:opacity-70"
            >
              <AppText className="text-[14px] font-semibold text-danger">Delete account</AppText>
            </Pressable>
          </>
        )}
      </ScrollView>
      <DeleteAccountDialog
        visible={showDeleteConfirm}
        isPending={deletionPending}
        errorMessage={deletionError}
        allowImmediateDeletion={false}
        onCancel={() => setShowDeleteConfirm(false)}
        onSchedule={scheduleDeletion}
      />
    </SafeAreaView>
  );
}
