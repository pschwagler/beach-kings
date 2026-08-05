import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import AppText from '@/components/ui/AppText';
import { useRouter } from 'expo-router';
import type { Session } from '@beach-kings/shared';
import CourtLineMotif from '@/components/brand/CourtLineMotif';
import { routes } from '@/lib/navigation';
import Button from '@/components/ui/Button';

export type HomeLeadState =
  | {
      readonly kind: 'active-session';
      readonly session: Session;
      readonly refreshFailed: boolean;
    }
  | { readonly kind: 'active-session-error' }
  | {
      readonly kind: 'friend-request';
      readonly count: number;
      readonly senderName: string | null;
    }
  | { readonly kind: 'profile'; readonly percent: number }
  | { readonly kind: 'record-game' };

interface HomeLeadActionProps {
  readonly state: HomeLeadState;
  readonly onRetryActiveSession: () => void;
}

function ActionButton({
  label,
  onPress,
  variant = 'gold',
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'gold' | 'teal';
}): React.ReactNode {
  return (
    <Button
      title={label}
      onPress={onPress}
      variant={variant === 'gold' ? 'secondary' : 'primary'}
      className={`${variant === 'gold' ? 'bg-brand-gold' : 'bg-brand-teal'} mt-md min-h-touch self-start justify-center rounded-card px-lg active:opacity-80`}
    />
  );
}

export default function HomeLeadAction({
  state,
  onRetryActiveSession,
}: HomeLeadActionProps): React.ReactNode {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const usesAccessibilityLayout = fontScale >= 1.6;

  let content: React.ReactNode;
  switch (state.kind) {
    case 'active-session': {
      const title =
        state.session.name ??
        state.session.code ??
        `Session #${state.session.id}`;
      const context =
        state.session.league_name ??
        state.session.court_name ??
        'Active session';
      content = (
        <>
          <AppText className="text-caption font-bold uppercase tracking-wide text-status-live">
            Continue playing
          </AppText>
          <AppText
            className="mt-xs text-title3 font-bold text-default"
            numberOfLines={2}
          >
            {title}
          </AppText>
          <AppText className="mt-xxs text-caption text-muted" numberOfLines={2}>
            {context}
          </AppText>
          {state.refreshFailed && (
            <AppText className="mt-sm text-caption text-warning">
              Could not refresh. Showing the last saved version.
            </AppText>
          )}
          <ActionButton
            label="Continue Session"
            onPress={() => router.push(routes.session(state.session.id))}
          />
        </>
      );
      break;
    }
    case 'active-session-error':
      content = (
        <>
          <AppText className="text-caption font-bold uppercase tracking-wide text-warning">
            Session unavailable
          </AppText>
          <AppText className="mt-xs text-title3 font-bold text-default">
            Check your active session
          </AppText>
          <AppText className="mt-xxs max-w-[250px] text-caption text-muted">
            We could not confirm whether you have a game in progress.
          </AppText>
          <ActionButton
            label="Try Again"
            onPress={onRetryActiveSession}
            variant="teal"
          />
        </>
      );
      break;
    case 'friend-request': {
      const requestCopy =
        state.count === 1 && state.senderName != null
          ? `${state.senderName} sent you a friend request.`
          : `You have ${state.count} new friend requests.`;
      content = (
        <>
          <AppText className="text-caption font-bold uppercase tracking-wide text-brand-teal">
            New connection
          </AppText>
          <AppText className="mt-xs text-title3 font-bold text-default">
            {state.count === 1
              ? 'Review friend request'
              : 'Review friend requests'}
          </AppText>
          <AppText className="mt-xxs max-w-[250px] text-caption text-muted">
            {requestCopy}
          </AppText>
          <ActionButton
            label={state.count === 1 ? 'Review Request' : 'Review Requests'}
            onPress={() => router.navigate(routes.social({ tab: 'friends' }))}
            variant="teal"
          />
        </>
      );
      break;
    }
    case 'profile':
      content = (
        <>
          <AppText className="text-caption font-bold uppercase tracking-wide text-brand-teal">
            {Math.max(0, Math.min(100, Math.round(state.percent)))}% complete
          </AppText>
          <AppText className="mt-xs text-title3 font-bold text-default">
            Finish setting up your profile
          </AppText>
          <AppText className="mt-xxs max-w-[250px] text-caption text-muted">
            Add your level and location to find the right games and players.
          </AppText>
          <ActionButton
            label="Complete Profile"
            onPress={() => router.push(routes.onboarding())}
            variant="teal"
          />
        </>
      );
      break;
    case 'record-game':
      content = (
        <>
          <AppText className="text-caption font-bold uppercase tracking-wide text-brand-teal">
            Your next move
          </AppText>
          <AppText className="mt-xs text-title3 font-bold text-default">
            Ready for another game?
          </AppText>
          <AppText className="mt-xxs max-w-[250px] text-caption text-muted">
            Record a league or pickup game while the score is fresh.
          </AppText>
          <ActionButton
            label="Record a Game"
            onPress={() => router.push(routes.addGames())}
          />
        </>
      );
      break;
  }

  return (
    <View
      testID={`home-lead-${state.kind}`}
      className="relative mb-lg min-h-[178px] overflow-hidden rounded-card border border-divider bg-surface p-lg"
    >
      {!usesAccessibilityLayout && <CourtLineMotif variant="home" />}
      <View className={`relative ${usesAccessibilityLayout ? 'max-w-full' : 'max-w-[78%]'}`}>
        {content}
      </View>
    </View>
  );
}
