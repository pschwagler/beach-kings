import React, { useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '@/components/ui/AppText';
import TopNav from '@/components/ui/TopNav';
import {
  ChevronRightIcon,
  LinkIcon,
  MessageCircleIcon,
  SendIcon,
} from '@/components/ui/icons';
import { routes } from '@/lib/navigation';
import { openPublicWebUrl } from '@/lib/externalUrls';
import { PUBLIC_URLS } from '@/lib/publicUrls';
import {
  openSupportMailto,
  SUPPORT_EMAIL,
  supportMailtoGeneral,
} from '@/lib/support';
import { hapticLight } from '@/utils/haptics';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface SupportRowProps {
  readonly label: string;
  readonly description?: string;
  readonly testID: string;
  readonly onPress: () => void;
  readonly icon: React.ReactNode;
}

function SupportRow({
  label,
  description,
  testID,
  onPress,
  icon,
}: SupportRowProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={description == null ? label : `${label}. ${description}`}
      className="min-h-touch flex-row items-center px-lg py-[14px] bg-surface border-b border-divider active:opacity-70"
    >
      <View className="w-9 items-start">{icon}</View>
      <View className="flex-1 pr-md">
        <AppText className="text-[15px] font-semibold text-default">
          {label}
        </AppText>
        {description != null && (
          <AppText className="text-[13px] text-muted mt-[2px]">
            {description}
          </AppText>
        )}
      </View>
      <ChevronRightIcon size={18} color={palette.textTertiary} />
    </Pressable>
  );
}

export default function SupportScreen(): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();

  const handleEmail = useCallback(() => {
    void hapticLight();
    void openSupportMailto(supportMailtoGeneral());
  }, []);

  const handleFeedback = useCallback(() => {
    void hapticLight();
    router.push(routes.settingsFeedback());
  }, [router]);

  const openPolicy = useCallback((url: string) => {
    void hapticLight();
    void openPublicWebUrl(url);
  }, []);

  return (
    <SafeAreaView
      testID="support-screen"
      className="flex-1 bg-page"
      edges={['top']}
    >
      <TopNav title="Support" showBack />
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-xxxl"
      >
        <View className="bg-brand-teal px-lg pt-xl pb-xxl">
          <AppText className="text-[12px] font-bold tracking-[1.2px] text-brand-gold">
            BEACH LEAGUE SUPPORT
          </AppText>
          <AppText className="text-[26px] leading-[31px] font-bold text-on-brand-teal mt-sm">
            We’re here to help.
          </AppText>
          <AppText className="text-[15px] leading-[21px] text-on-brand-teal opacity-80 mt-sm max-w-[330px]">
            Get help with your account, leagues, games, or the mobile app.
          </AppText>
        </View>

        <AppText className="text-[13px] font-bold tracking-[0.6px] text-muted px-lg pt-xl pb-sm">
          CONTACT
        </AppText>
        <SupportRow
          testID="support-email"
          label="Email support"
          description={SUPPORT_EMAIL}
          onPress={handleEmail}
          icon={<MessageCircleIcon size={22} color={palette.brandTeal} />}
        />
        <SupportRow
          testID="support-feedback"
          label="Share product feedback"
          description="Send an idea or tell us what could be better"
          onPress={handleFeedback}
          icon={<SendIcon size={22} color={palette.brandTeal} />}
        />

        <View className="px-lg pt-lg pb-md">
          <AppText className="text-[14px] leading-[20px] text-muted">
            Include the email on your account and a short description. Never send your password or verification code.
          </AppText>
        </View>

        <AppText className="text-[13px] font-bold tracking-[0.6px] text-muted px-lg pt-lg pb-sm">
          POLICIES
        </AppText>
        <SupportRow
          testID="support-community-guidelines"
          label="Community Guidelines"
          onPress={() => openPolicy(PUBLIC_URLS.communityGuidelines)}
          icon={<LinkIcon size={21} color={palette.textMuted} />}
        />
        <SupportRow
          testID="support-terms"
          label="Terms of Service"
          onPress={() => openPolicy(PUBLIC_URLS.terms)}
          icon={<LinkIcon size={21} color={palette.textMuted} />}
        />
        <SupportRow
          testID="support-privacy"
          label="Privacy Policy"
          onPress={() => openPolicy(PUBLIC_URLS.privacy)}
          icon={<LinkIcon size={21} color={palette.textMuted} />}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
