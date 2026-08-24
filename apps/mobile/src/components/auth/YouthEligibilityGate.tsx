import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import AppText from '@/components/ui/AppText';
import { Button } from '@/components/ui';
import { BottomSheetSelect, FormLabel } from '@/components/forms';
import { CheckIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { api } from '@/lib/api';
import { PUBLIC_URLS } from '@/lib/publicUrls';
import { openPublicWebUrl } from '@/lib/externalUrls';
import { requestDeclaredAgeRange } from 'expo-declared-age-range';

type Band = 'under_minimum' | 'junior' | 'adult';
type Declaration =
  | 'self_declared'
  | 'guardian_declared'
  | 'verified'
  | 'guardian_verified'
  | 'not_shared';

export function declarationFromApple(value?: string): Declaration {
  const normalized = (value ?? '').toLowerCase();
  const guardian = normalized.includes('guardian');
  const verified = /checked|payment|government/.test(normalized);
  if (guardian && verified) return 'guardian_verified';
  if (guardian) return 'guardian_declared';
  if (verified) return 'verified';
  return 'self_declared';
}

export function bandFromApple(lowerBound: number | undefined): Band {
  if (lowerBound == null) return 'under_minimum';
  return lowerBound >= 18 ? 'adult' : 'junior';
}

interface Props {
  readonly onEligible: (token: string) => void;
}

export default function YouthEligibilityGate({ onEligible }: Props): React.ReactNode {
  const palette = usePaletteColors();
  const [band, setBand] = useState<Band | ''>('');
  const [source, setSource] = useState<'apple_declared_age_range' | 'self_declared'>('self_declared');
  const [declaration, setDeclaration] = useState<Declaration>('not_shared');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [fallbackVisible, setFallbackVisible] = useState(Platform.OS !== 'ios');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const appleRequestStarted = useRef(false);

  const minimumAge = 14 as const;
  const bandOptions = useMemo(
    () => [
      { value: 'under_minimum', label: `Under ${minimumAge}` },
      { value: 'junior', label: `${minimumAge}–17` },
      { value: 'adult', label: '18 or older' },
    ],
    [minimumAge],
  );

  const submitFacts = useCallback(async (
    selectedBand: Band,
    selectedSource = source,
    selectedDeclaration = declaration,
    consent = guardianConsent,
  ) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.checkYouthEligibility({
        declared_band: selectedBand,
        assurance_source: selectedSource,
        declaration_source: selectedDeclaration,
        guardian_consent: consent,
      });
      onEligible(result.eligibility_token);
    } catch (caught) {
      const message = (caught as { response?: { data?: { detail?: string } } })
        .response?.data?.detail;
      setError(message ?? 'We could not complete the age check. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [declaration, guardianConsent, onEligible, source]);

  const handleAppleAgeRange = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await requestDeclaredAgeRange(minimumAge);
    setLoading(false);
    if (result.status !== 'shared') {
      setFallbackVisible(true);
      setSource('self_declared');
      setDeclaration('not_shared');
      return;
    }
    const selectedBand = bandFromApple(result.lowerBound);
    const selectedDeclaration = declarationFromApple(result.declaration);
    const consent = selectedDeclaration.startsWith('guardian_');
    setBand(selectedBand);
    setSource('apple_declared_age_range');
    setDeclaration(selectedDeclaration);
    setGuardianConsent(consent);
    if (selectedBand === 'adult' || selectedBand === 'under_minimum' || consent) {
      await submitFacts(selectedBand, 'apple_declared_age_range', selectedDeclaration, consent);
    } else {
      setFallbackVisible(true);
    }
  }, [minimumAge, submitFacts]);

  useEffect(() => {
    if (Platform.OS === 'ios' && !appleRequestStarted.current) {
      appleRequestStarted.current = true;
      void handleAppleAgeRange();
    }
  }, [handleAppleAgeRange]);

  const canContinue = Boolean(band) && (band !== 'junior' || guardianConsent);

  return (
    <View className="bg-surface rounded-card p-lg gap-md" testID="youth-eligibility-gate">
      <View>
        <AppText className="text-title3 font-bold text-default">Before you create an account</AppText>
        <AppText className="text-body text-muted mt-xs">
          Share only your age range so we can apply the right safety settings. We won’t ask for
          your birthdate or jurisdiction.
        </AppText>
      </View>

      {Platform.OS === 'ios' && !fallbackVisible ? (
        <Button
          title="Share Age Range with Apple"
          onPress={() => { void handleAppleAgeRange(); }}
          disabled={loading}
          loading={loading}
          variant="secondary"
        />
      ) : null}

      {fallbackVisible ? (
        <View className="gap-md">
          <View>
            <FormLabel>Age range</FormLabel>
            <BottomSheetSelect
              title="Select age range"
              placeholder="Select age range"
              value={band}
              options={bandOptions}
              onChange={(value) => {
                setBand(value as Band);
                setSource('self_declared');
                setDeclaration('self_declared');
                setGuardianConsent(false);
                setError('');
              }}
              testID="age-band"
            />
          </View>

          {band === 'junior' ? (
            <View className="bg-surface-raised rounded-lg p-md gap-sm">
              <AppText className="text-footnote text-default">
                Junior accounts are private by default. Only accepted friends in an active shared
                league can send direct messages, and precise location isn’t shown publicly.
              </AppText>
              <Pressable
                className="flex-row gap-sm min-h-touch items-center"
                onPress={() => setGuardianConsent((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: guardianConsent }}
              >
                <View className="w-6 h-6 rounded border border-border-strong items-center justify-center">
                  {guardianConsent ? <CheckIcon size={16} color={palette.brandTeal} /> : null}
                </View>
                <AppText className="text-footnote text-default flex-1">
                  My parent or legal guardian has reviewed this and agrees to my account.
                </AppText>
              </Pressable>
            </View>
          ) : null}

          <Button
            title="Continue"
            onPress={() => { if (band) void submitFacts(band); }}
            disabled={!canContinue || loading}
            loading={loading}
            variant="secondary"
          />
        </View>
      ) : null}

      {error ? (
        <AppText className="text-footnote text-danger" accessibilityRole="alert">{error}</AppText>
      ) : null}

      <AppText className="text-caption text-muted">
        Learn how we protect teens in our{' '}
        <AppText className="text-caption text-brand-teal underline" onPress={() => void openPublicWebUrl(PUBLIC_URLS.privacy)}>
          Privacy Policy
        </AppText>
        .
      </AppText>
    </View>
  );
}
