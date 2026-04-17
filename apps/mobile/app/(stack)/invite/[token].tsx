import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button, TopNav } from '@/components/ui';
import { api } from '@/lib/api';

interface InviteDetails {
  readonly inviter_name: string;
  readonly placeholder_name: string;
  readonly match_count: number;
  readonly league_names: readonly string[];
  readonly status: string;
}

type ScreenState = 'loading' | 'loaded' | 'error' | 'claimed_success';

export default function InviteClaimScreen(): React.ReactNode {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    api.client.axiosInstance
      .get(`/api/invites/${token}`)
      .then((res) => {
        if (!cancelled) {
          setInvite(res.data);
          setScreenState('loaded');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const status = err?.response?.status;
          setErrorMessage(
            status === 404
              ? 'This invite was not found or has expired.'
              : 'Failed to load invite details.',
          );
          setScreenState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleClaim = useCallback(async () => {
    if (!token) return;
    setIsClaiming(true);
    try {
      await api.client.axiosInstance.post(`/api/invites/${token}/claim`);
      Alert.alert('Success', 'Invite claimed! Your match history has been linked.');
      setScreenState('claimed_success');
    } catch {
      Alert.alert('Error', 'Failed to claim invite. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  }, [token]);

  const handleSignUp = useCallback(() => {
    router.push('/(auth)/signup');
  }, [router]);

  const isClaimed = invite?.status === 'claimed';

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title="Invite" showBack />

      <View className="flex-1 justify-center px-lg">
        {screenState === 'loading' && (
          <View testID="invite-loading" className="items-center">
            <ActivityIndicator size="large" />
            <Text className="text-body text-gray-500 dark:text-content-secondary mt-md">
              Loading invite...
            </Text>
          </View>
        )}

        {screenState === 'error' && (
          <View className="items-center">
            <Text className="text-title2 font-bold text-red-600 dark:text-red-400 mb-sm">
              Invite not found
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center">
              {errorMessage}
            </Text>
          </View>
        )}

        {screenState === 'loaded' && invite && (
          <View className="gap-md">
            {isClaimed ? (
              <View className="items-center">
                <Text className="text-title2 font-bold text-gray-600 dark:text-content-secondary text-center mb-sm">
                  This invite has already been claimed
                </Text>
                <Text className="text-body text-gray-500 dark:text-content-tertiary text-center">
                  The invite from {invite.inviter_name} for {invite.placeholder_name} has already been used.
                </Text>
              </View>
            ) : (
              <>
                <View className="items-center mb-md">
                  <Text className="text-title2 font-bold text-primary dark:text-content-primary text-center mb-sm">
                    You've been invited!
                  </Text>
                  <Text className="text-body text-gray-500 dark:text-content-secondary text-center">
                    {invite.inviter_name} added you as {invite.placeholder_name}
                  </Text>
                </View>

                <View className="bg-white dark:bg-dark-surface rounded-card p-lg gap-sm">
                  <View className="flex-row justify-between">
                    <Text className="text-body text-gray-500 dark:text-content-secondary">
                      Matches
                    </Text>
                    <Text className="text-body font-semibold text-primary dark:text-content-primary">
                      {invite.match_count} matches
                    </Text>
                  </View>

                  {invite.league_names.length > 0 && (
                    <View className="gap-xs">
                      <Text className="text-footnote text-gray-500 dark:text-content-secondary">
                        Leagues
                      </Text>
                      {invite.league_names.map((name) => (
                        <Text
                          key={name}
                          className="text-body font-medium text-primary dark:text-content-primary"
                        >
                          {name}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>

                <View className="mt-md">
                  {isAuthenticated ? (
                    <Button
                      title="Claim Invite"
                      onPress={handleClaim}
                      disabled={isClaiming}
                      loading={isClaiming}
                    />
                  ) : (
                    <Button
                      title="Sign Up to Claim"
                      onPress={handleSignUp}
                    />
                  )}
                </View>
              </>
            )}
          </View>
        )}

        {screenState === 'claimed_success' && (
          <View className="items-center">
            <Text className="text-title2 font-bold text-green-600 dark:text-green-400 mb-sm">
              Invite Claimed!
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center">
              Your match history has been linked to your account.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
