/**
 * Invite claim screen.
 * Mirrors `mobile-audit/wireframes/invite-claim.html`.
 *
 * Flow: loading → loaded (review) → [claiming] → claimed_success
 *                                → error (404 / already claimed)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Alert, ActivityIndicator, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Button, TopNav, CheckCircleIcon } from '@/components/ui';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticLight, hapticSuccess } from '@/utils/haptics';

/**
 * Shape returned by GET /api/invites/:token.
 *
 * TODO: When the backend expands InviteDetailsResponse to include:
 *   - matches: Array<{ id, date, league_name, partner_name, opponent_names, score? }>
 *   - inherited_rating: number
 *   - wins: number / losses: number
 * remove the match-placeholder cards and the TODO below, and render real data.
 * Backend endpoint: apps/backend/api/routes/players.py → get_invite_details
 * Backend schema: apps/backend/models/schemas.py → InviteDetailsResponse
 */
interface InviteDetails {
  readonly inviter_name: string;
  readonly placeholder_name: string;
  readonly match_count: number;
  readonly league_names: readonly string[];
  readonly status: string;
  /**
   * Optional rating the user will inherit. Not yet returned by the backend.
   * Rendered only when present.
   */
  readonly inherited_rating?: number;
}

type ScreenState = 'loading' | 'loaded' | 'error' | 'claimed_success';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Placeholder match card shown when the backend only returns `match_count`.
 *
 * TODO: Replace with real match data once the backend expands the invite
 * details endpoint to include `matches` array.
 * Ref: apps/backend/api/routes/players.py → get_invite_details
 */
function PlaceholderMatchCard({ index }: { readonly index: number }): React.ReactNode {
  return (
    <View
      testID={`invite-match-card-${index}`}
      className="bg-surface rounded-card p-md mb-sm shadow-sm dark:shadow-none dark:border dark:border-divider"
    >
      <View className="flex-row justify-between items-center mb-xs">
        <Text className="text-footnote font-semibold text-muted">
          Match #{index + 1}
        </Text>
      </View>
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-caption font-bold text-brand-gold">
            You
          </Text>
          <Text className="text-caption text-muted">
            Partner —
          </Text>
        </View>
        <Text className="text-title3 font-extrabold text-default mx-sm">
          — : —
        </Text>
        <View className="flex-1 items-end">
          <Text className="text-caption text-muted">
            Opponents
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Teal callout shown when the invite carries an inherited rating.
 * Only rendered when `inherited_rating` is present in the API response.
 */
function InheritedRatingCallout({
  rating,
  matchCount,
}: {
  readonly rating: number;
  readonly matchCount: number;
}): React.ReactNode {
  return (
    <View
      testID="invite-inherited-rating"
      className="bg-[#1a3a4a] dark:bg-[#0f2535] rounded-card p-md mb-md"
    >
      <View className="flex-row items-center gap-xs mb-sm">
        <Text className="text-[11px] font-bold tracking-widest uppercase text-[#7fb3c8]">
          What you'll inherit
        </Text>
      </View>
      <View className="flex-row items-center gap-md">
        <View className="bg-brand-gold rounded-lg px-md py-sm items-center">
          <Text className="text-2xl font-black text-white leading-tight">
            {rating}
          </Text>
          <Text className="text-[10px] font-bold text-white/75 uppercase tracking-wider mt-[2px]">
            Rating
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-white leading-snug mb-[2px]">
            You'll inherit a {rating} rating
          </Text>
          <Text className="text-xs text-[#7fb3c8] leading-snug">
            Calculated from {matchCount} recorded {matchCount === 1 ? 'game' : 'games'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

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

    api
      .getInviteDetails(token)
      .then((data) => {
        if (!cancelled) {
          setInvite(data);
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

  // Trigger success haptic once when transitioning to claimed_success.
  useEffect(() => {
    if (screenState === 'claimed_success') {
      void hapticSuccess();
    }
  }, [screenState]);

  const handleClaim = useCallback(async () => {
    if (!token) return;
    setIsClaiming(true);
    try {
      await api.claimInvite(token);
      Alert.alert('Success', 'Invite claimed! Your match history has been linked.');
      setScreenState('claimed_success');
    } catch {
      Alert.alert('Error', 'Failed to claim invite. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  }, [token]);

  const handleSignUp = useCallback(() => {
    router.push(routes.signup());
  }, [router]);

  const handleSkip = useCallback(() => {
    void hapticLight();
    Alert.alert(
      'Are you sure?',
      'This invite will be dismissed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: () => {
            // Navigate back if there is history, otherwise go home.
            try {
              router.back();
            } catch {
              router.replace(routes.home());
            }
          },
        },
      ],
    );
  }, [router]);

  const handleGetStarted = useCallback(() => {
    router.replace(routes.home());
  }, [router]);

  const isClaimed = invite?.status === 'claimed';

  return (
    <SafeAreaView className="flex-1 bg-page">
      <TopNav title="Claim Your Games" showBack />

      {/* Loading */}
      {screenState === 'loading' && (
        <View testID="invite-loading" className="flex-1 items-center justify-center px-lg">
          <ActivityIndicator size="large" />
          <Text className="text-body text-muted mt-md">
            Loading invite...
          </Text>
        </View>
      )}

      {/* Error */}
      {screenState === 'error' && (
        <View className="flex-1 items-center justify-center px-lg gap-md">
          <View className="w-20 h-20 rounded-full bg-danger-tint border-2 border-danger items-center justify-center mb-sm">
            <Text className="text-3xl font-black text-danger">!</Text>
          </View>
          <Text className="text-title2 font-bold text-default text-center">
            Invite not found
          </Text>
          <Text className="text-body text-muted text-center">
            {errorMessage}
          </Text>
        </View>
      )}

      {/* Loaded — review state */}
      {screenState === 'loaded' && invite && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Welcome header */}
          <View className="bg-surface px-lg py-xl items-center border-b border-divider">
            <Text className="text-title2 font-extrabold text-default text-center mb-xs">
              Welcome to Beach League!
            </Text>
            <Text className="text-body text-muted text-center mb-sm">
              {invite.inviter_name} recorded games with you as {invite.placeholder_name}. Claim them to start tracking your stats.
            </Text>
            {invite.league_names.length > 0 && (
              <View className="flex-row items-center gap-xs mt-xs px-md py-xs rounded-full bg-info-tint">
                <Text className="text-footnote font-semibold text-brand-teal">
                  {invite.league_names[0]}
                  {invite.league_names.length > 1 ? ` +${invite.league_names.length - 1}` : ''}
                </Text>
              </View>
            )}
          </View>

          <View className="px-lg pt-md">
            {isClaimed ? (
              // Already-claimed sub-state (shown while in 'loaded' if status === 'claimed')
              <View className="items-center gap-md mt-xl">
                <Text className="text-title2 font-bold text-muted text-center mb-sm">
                  This invite has already been claimed
                </Text>
                <Text className="text-body text-muted text-center">
                  The invite from {invite.inviter_name} for {invite.placeholder_name} has already been used.
                </Text>
              </View>
            ) : (
              <>
                {/* Claim summary count */}
                <View className="flex-row items-center gap-md p-md mb-md bg-warning-tint rounded-card border border-brand-gold/30">
                  <Text className="text-4xl font-black text-brand-gold leading-none">
                    {invite.match_count}
                  </Text>
                  <View>
                    <Text className="text-sm font-bold text-default">
                      {invite.match_count} unclaimed {invite.match_count === 1 ? 'game' : 'games'}
                    </Text>
                    <Text className="text-xs text-muted mt-[2px]">
                      Ready to link to your account
                    </Text>
                  </View>
                </View>

                {/* Inherited rating callout — only when field is present in API response */}
                {invite.inherited_rating != null && (
                  <InheritedRatingCallout
                    rating={invite.inherited_rating}
                    matchCount={invite.match_count}
                  />
                )}

                {/* Match cards section */}
                <Text className="text-footnote font-bold text-default mb-sm mt-xs">
                  Your Games
                </Text>

                {/*
                 * TODO: Replace placeholder cards with real match data once the backend
                 * expands InviteDetailsResponse to include a `matches` array.
                 * Backend: apps/backend/api/routes/players.py → get_invite_details
                 * Schema:  apps/backend/models/schemas.py → InviteDetailsResponse
                 */}
                {Array.from({ length: invite.match_count }, (_, i) => (
                  <PlaceholderMatchCard key={i} index={i} />
                ))}

                {/* Actions */}
                <View className="mt-md gap-sm">
                  {isAuthenticated ? (
                    <Button
                      title="Claim My Games"
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

                  {/* "Not me" secondary CTA */}
                  <Pressable
                    onPress={handleSkip}
                    accessibilityRole="button"
                    accessibilityLabel="Not me, skip this invite"
                    className="items-center justify-center min-h-touch py-sm"
                  >
                    <Text className="text-body font-semibold text-muted">
                      Not me — skip
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      )}

      {/* Success */}
      {screenState === 'claimed_success' && (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <View testID="invite-success" className="flex-1 items-center px-lg pt-[40px] pb-[36px] gap-lg">
            {/* Success icon */}
            <View className="w-20 h-20 rounded-full bg-success-tint border-[3px] border-success items-center justify-center">
              <CheckCircleIcon size={40} color="#22c55e" />
            </View>

            {/* Badge */}
            <View className="flex-row items-center gap-xs px-md py-xs rounded-full bg-success-tint border border-success">
              <View className="w-2 h-2 rounded-full bg-success" />
              <Text className="text-[11px] font-bold tracking-widest uppercase text-success">
                Account linked successfully
              </Text>
            </View>

            {/* Headline */}
            <Text className="text-[24px] font-black text-default text-center">
              You're all set!
            </Text>

            {/* Body */}
            <Text className="text-body text-muted text-center max-w-[300px]">
              Your game history and rating have been merged into your account. Welcome to the league.
            </Text>

            {/* CTA */}
            <View className="w-full gap-sm mt-sm">
              <Button
                title="Go to Dashboard"
                onPress={handleGetStarted}
              />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
