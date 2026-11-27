import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { TrophyIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
import type { LeaguePicture } from '@beach-kings/shared';

interface Props {
  readonly leagueId: number;
  readonly picture?: LeaguePicture;
}

function AvatarContent({ leagueId, picture }: Props) {
  const palette = usePaletteColors();
  const [failed, setFailed] = useState(false);
  const uri = picture?.data_uri;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="w-11 h-11 shrink-0 overflow-hidden rounded-[10px] bg-info-tint items-center justify-center"
    >
      {uri && !failed ? (
        <Image
          testID={`league-avatar-photo-${leagueId}`}
          source={{ uri }}
          cachePolicy="none"
          contentFit="cover"
          onError={() => setFailed(true)}
          style={{ width: 44, height: 44 }}
        />
      ) : (
        <View testID={`league-avatar-fallback-${leagueId}`}>
          <TrophyIcon size={22} color={palette.brandTeal} />
        </View>
      )}
    </View>
  );
}

export default function LeagueAvatar(props: Props) {
  return <AvatarContent key={`${props.leagueId}:${props.picture?.revision}`} {...props} />;
}
