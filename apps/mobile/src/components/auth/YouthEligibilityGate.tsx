import React, { useCallback, useMemo, useState } from 'react';
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

type Country = 'US' | 'CA';
type Band = 'under_minimum' | 'junior' | 'adult';
type Declaration =
  | 'self_declared'
  | 'guardian_declared'
  | 'verified'
  | 'guardian_verified'
  | 'not_shared';

const US_REGIONS = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'],
  ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
] as const;

const CA_REGIONS = [
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'],
  ['NB', 'New Brunswick'], ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'],
  ['NT', 'Northwest Territories'], ['NU', 'Nunavut'], ['ON', 'Ontario'],
  ['PE', 'Prince Edward Island'], ['QC', 'Québec'], ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
] as const;

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
  const [country, setCountry] = useState<Country | ''>('');
  const [region, setRegion] = useState('');
  const [band, setBand] = useState<Band | ''>('');
  const [source, setSource] = useState<'apple_declared_age_range' | 'self_declared'>('self_declared');
  const [declaration, setDeclaration] = useState<Declaration>('not_shared');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [fallbackVisible, setFallbackVisible] = useState(Platform.OS !== 'ios');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const minimumAge = country === 'CA' ? 14 : 13;
  const regionOptions = useMemo(
    () => (country === 'CA' ? CA_REGIONS : US_REGIONS).map(([value, label]) => ({ value, label })),
    [country],
  );
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
    if (!country || !region) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.checkYouthEligibility({
        country_code: country,
        region_code: region,
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
  }, [country, declaration, guardianConsent, onEligible, region, source]);

  const handleAppleAgeRange = useCallback(async () => {
    if (!country || !region) {
      setError('Select your country and state or province first.');
      return;
    }
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
  }, [country, minimumAge, region, submitFacts]);

  const canContinue = Boolean(country && region && band)
    && (band !== 'junior' || guardianConsent);

  return (
    <View className="bg-surface rounded-card p-lg gap-md" testID="youth-eligibility-gate">
      <View>
        <AppText className="text-title3 font-bold text-default">Before you create an account</AppText>
        <AppText className="text-body text-muted mt-xs">
          Tell us only your age range and location. We use these to keep Beach League safer and
          won’t ask for your birthdate.
        </AppText>
      </View>

      <View>
        <FormLabel>Country</FormLabel>
        <BottomSheetSelect
          title="Select country"
          placeholder="Select country"
          value={country}
          options={[{ value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }]}
          onChange={(value) => { setCountry(value as Country); setRegion(''); setBand(''); setError(''); }}
          testID="age-country"
        />
      </View>

      {country ? (
        <View>
          <FormLabel>{country === 'CA' ? 'Province or territory' : 'State'}</FormLabel>
          <BottomSheetSelect
            title={country === 'CA' ? 'Select province or territory' : 'Select state'}
            placeholder={country === 'CA' ? 'Select province or territory' : 'Select state'}
            value={region}
            options={regionOptions}
            onChange={(value) => { setRegion(value); setBand(''); setError(''); }}
            searchable
            testID="age-region"
          />
        </View>
      ) : null}

      {Platform.OS === 'ios' && !fallbackVisible ? (
        <Button
          title="Share Age Range with Apple"
          onPress={() => { void handleAppleAgeRange(); }}
          disabled={!country || !region || loading}
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
