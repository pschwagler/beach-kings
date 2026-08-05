import React, { useCallback, useState } from 'react';
import { Alert, View, Pressable, TextInput } from 'react-native';
import AppText from '@/components/ui/AppText';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { useAuth } from '@/contexts/AuthContext';

const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_USER_EMAIL ?? '';
const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_USER_PASSWORD ?? '';

interface DevLoginPanelProps {
  readonly onSelect: (email: string, password: string) => void;
}

export default function DevLoginPanel({
  onSelect,
}: DevLoginPanelProps): React.ReactNode {
  const { devLoginWithTokens } = useAuth();
  const palette = usePaletteColors();
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const importTokens = useCallback(async () => {
    if (!accessToken.trim() || !refreshToken.trim() || isImporting) return;
    if (devLoginWithTokens == null) return;
    setIsImporting(true);
    try {
      await devLoginWithTokens({ accessToken, refreshToken });
      setAccessToken('');
      setRefreshToken('');
    } catch {
      Alert.alert(
        'Credential Import Failed',
        'The development credential pair could not be verified.',
      );
    } finally {
      setIsImporting(false);
    }
  }, [accessToken, devLoginWithTokens, isImporting, refreshToken]);

  return (
    <View
      testID="dev-login-panel"
      className="mt-lg rounded-card border border-dashed border-warning bg-warning-tint p-md gap-sm"
    >
      <AppText className="text-xs text-warning font-bold text-center tracking-widest">
        DEV ONLY
      </AppText>
      {DEV_EMAIL && DEV_PASSWORD ? (
        <Pressable
          onPress={() => onSelect(DEV_EMAIL, DEV_PASSWORD)}
          accessibilityLabel="Dev quick login"
          accessibilityRole="button"
          className="min-h-touch border border-warning rounded-lg px-md items-center justify-center active:opacity-70"
        >
          <AppText className="text-warning text-sm font-semibold">
            Quick Login ({DEV_EMAIL.split('@')[0]})
          </AppText>
        </Pressable>
      ) : null}

      <AppText className="text-caption text-muted">
        Paste the token pair produced by scripts/dev_login.py. Fields are
        cleared after secure import; tokens are never logged.
      </AppText>
      <TextInput
        testID="dev-access-token"
        value={accessToken}
        onChangeText={setAccessToken}
        placeholder="Access token"
        placeholderTextColor={palette.textTertiary}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        className="min-h-touch rounded-lg border border-strong bg-surface px-md text-default"
        accessibilityLabel="Development access token"
      />
      <TextInput
        testID="dev-refresh-token"
        value={refreshToken}
        onChangeText={setRefreshToken}
        placeholder="Refresh token"
        placeholderTextColor={palette.textTertiary}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        className="min-h-touch rounded-lg border border-strong bg-surface px-md text-default"
        accessibilityLabel="Development refresh token"
      />
      <Pressable
        testID="dev-import-tokens"
        onPress={() => {
          void importTokens();
        }}
        disabled={!accessToken.trim() || !refreshToken.trim() || isImporting}
        accessibilityLabel="Import development tokens"
        accessibilityRole="button"
        accessibilityState={{
          disabled: !accessToken.trim() || !refreshToken.trim() || isImporting,
          busy: isImporting,
        }}
        className="min-h-touch rounded-lg bg-warning-fill px-md items-center justify-center disabled:opacity-50 active:opacity-70"
      >
        <AppText className="text-on-warning text-sm font-semibold">
          {isImporting ? 'Importing…' : 'Import Tokens'}
        </AppText>
      </Pressable>
    </View>
  );
}
